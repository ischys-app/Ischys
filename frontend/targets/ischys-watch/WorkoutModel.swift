import Combine
import Foundation
import WatchKit

/// The single source of UI state for the Watch app. Everything the six screens
/// render reads from here.
///
/// The phone is the source of truth: it pushes the workout state over
/// WatchConnectivity (see `PhoneLink`), which decodes into the fields below. The
/// Watch owns only what is genuinely local — the live rest countdown tick, the
/// Crown-adjusted weight/reps before they are logged, and the live sensor
/// metrics from its own `HKWorkoutSession`.
///
/// Actions the user takes (log a set, adjust rest, end) are sent back to the
/// phone through `PhoneLink`, which the phone applies through the same JS path as
/// the Live Activity buttons. The Watch never writes to the API.
enum WatchScreen {
  case start    // S1 — pick a routine / empty
  case session  // S2/S3/S4/S5 — the paged workout
  case summary  // S6
}

enum SetDot: Hashable {
  case done
  case active
  case pending
}

struct RoutineItem: Identifiable, Hashable {
  let id: String
  let name: String
  let initials: String
  let exerciseCount: Int
}

struct SessionSummary: Equatable {
  var routineName: String
  var dateLabel: String
  var timeLabel: String
  var volumeKg: Int
  var sets: Int
  var avgHr: Int
  var activeCal: Int
  var prs: Int
}

@MainActor
final class WorkoutModel: ObservableObject {
  static let shared = WorkoutModel()

  @Published var screen: WatchScreen = .start

  // S1 — Start
  @Published var routines: [RoutineItem] = []
  /// Set while the current exercise is part of a superset (#53).
  @Published var supersetLabel = ""

  /// Whether the paired iPhone is reachable over WatchConnectivity. Drives the
  /// S-B start state: the "Synced with iPhone" chip flips to a warning and the
  /// routine list dims, while Empty Workout stays enabled (the Watch owns the
  /// HKWorkoutSession either way and reconciles when the phone returns).
  /// Updated by `PhoneLink` on activation and reachability changes.
  @Published var phoneReachable = true

  /// The routine the user just tapped to start, while the phone spins it up
  /// (S-C · handing off). Its row holds a pending state; the others dim. Cleared
  /// once we leave the Start screen (a pushed `.session` state, or on reappear).
  @Published var pendingRoutineId: String?

  // S2 — Active Set. `weight`/`reps` are Crown-editable locally, seeded by the
  // phone and sent back on Log Set.
  @Published var exerciseName = ""
  @Published var equipment = ""
  @Published var setNum = 1
  @Published var setCount = 1
  @Published var weight = ""
  @Published var reps = ""
  @Published var prevWeight = ""
  @Published var prevReps = ""
  @Published var setDots: [SetDot] = []

  /// Bumped whenever `weight`/`reps` were replaced by the phone. The Crown keeps
  /// its own Double, so the Active Set view has to be told to re-seed it —
  /// without that, the display would show the new number while the next notch
  /// wrote the old one straight back.
  @Published var valueSeed = 0

  // S3 — Rest. The phone owns the rest; `restRemaining` is counted down here to
  // the end date it pushed (see "Rest countdown" below).
  @Published var resting = false
  @Published var restRemaining = 0
  @Published var restTotal = 0
  @Published var nextSetLabel = ""

  // S4 — Metrics. HR / activeCal come from the Watch session; volume / sets from
  // the phone; elapsed from the session start date.
  @Published var routineName = ""
  @Published var heartRate = 0
  @Published var activeCal = 0
  @Published var volumeKg = 0
  @Published var setsDone = 0
  @Published var setsTotal = 0
  @Published var elapsedSec = 0

  // S6 — Summary
  @Published var summary: SessionSummary?

  // MARK: Derived state

  /// E1 — every planned set is logged, so the Active Set page has nothing left
  /// to log and shows the end-of-workout state instead. Derived from the
  /// phone-pushed session counters. `setsTotal` is 0 until the phone reports a
  /// plan, so an empty (unplanned) workout never trips this on its own.
  var allSetsDone: Bool { setsTotal > 0 && setsDone >= setsTotal }

  /// W3 — the rest countdown's final stretch, when the banner turns warm, the
  /// countdown pulses, and Skip reads "Start set". Only meaningful while resting.
  var restFinal: Bool { resting && restRemaining <= 10 }

  // MARK: Local ticks

  private var restTimer: Timer?
  private var elapsedTimer: AnyCancellable?

  // MARK: Rest countdown

  /// When the running rest ends, as pushed by the phone. nil when not resting,
  /// or when the phone gave no end date (then the pushed seconds are shown).
  private var restEndsAt: Date?
  private var restAlarm = RestAlarm()

  /// Whether a rest-complete notification arriving now would repeat a buzz this
  /// app has just played or is about to. Read by `RestAlertMute`.
  var ownsRestBuzz: Bool { restAlarm.owns(now: Date()) }

  /// Where the elapsed clock counts from.
  ///
  /// Our `HKWorkoutSession` starts whenever the Watch app got going, which is
  /// not when the workout started — the phone can launch us seconds later, or
  /// the user can open the Watch app mid-session. Counting from the session made
  /// the Watch's elapsed disagree with the phone's, so the phone's `startedAt`
  /// wins as soon as it arrives and the session start is only the fallback until
  /// then (see `apply`).
  private var elapsedOrigin: Date?

  // MARK: Crown arbitration

  /// When the user last turned the Digital Crown. The phone is the source of
  /// truth for weight/reps, but a value yanked out from under a wrist that is
  /// mid-adjustment is worse than a value a couple of seconds stale — so a
  /// pushed edit waits for the Crown to go quiet.
  private var lastCrownEdit: Date?
  private let crownGrace: TimeInterval = 3

  /// Called by the Active Set view on a real user turn (not on a re-seed).
  func noteCrownEdit() { lastCrownEdit = Date() }

  private var crownIsBusy: Bool {
    guard let last = lastCrownEdit else { return false }
    return Date().timeIntervalSince(last) < crownGrace
  }

  /// Drives the elapsed clock while a session runs.
  func startTicking(sessionStart: Date) {
    // Only a seed: a `startedAt` already pushed by the phone is the better
    // origin and must not be thrown away by the session starting afterwards.
    if elapsedOrigin == nil { elapsedOrigin = sessionStart }
    elapsedTimer = Timer.publish(every: 1, on: .main, in: .common)
      .autoconnect()
      .sink { [weak self] _ in self?.tick() }
    tick() // Don't show 0 for the first second of a workout already underway.
  }

  func stopTicking() {
    elapsedTimer?.cancel()
    elapsedTimer = nil
    elapsedOrigin = nil
    // The session is over, so nothing keeps us running to the end of a rest —
    // and a buzz for a rest in a workout that has ended would be wrong anyway.
    restAlarm.cancel()
    restEndsAt = nil
    scheduleRestTimer()
  }

  private func tick() {
    if let start = elapsedOrigin {
      elapsedSec = max(0, Int(Date().timeIntervalSince(start)))
    }
    // A second chance for the rest's end, should its own timer be held back.
    restTick()
  }

  /// Derive the countdown from the end date and buzz if the rest just ran out.
  ///
  /// Derived, never decremented: a counter loses however long the app was not
  /// running, and the phone's pushed `restRemaining` stops arriving once its JS
  /// is suspended — the wrist used to freeze mid-countdown with the phone locked.
  private func restTick() {
    let now = Date()
    if let end = restEndsAt {
      // Rounds up, as the phone does, so the two read the same second.
      let remaining = max(0, Int(end.timeIntervalSince(now).rounded(.up)))
      if restRemaining != remaining { restRemaining = remaining }
      if resting != (remaining > 0) { resting = remaining > 0 }
      if remaining == 0 { restEndsAt = nil }
    }
    if restAlarm.poll(now: now) { playRestHaptic() }
    if restEndsAt == nil { scheduleRestTimer() }
  }

  /// One repeating timer while a rest runs, phased so that a tick lands on the
  /// end date itself: the countdown changes on the second and the buzz is not up
  /// to a second late. The active `HKWorkoutSession` keeps it firing with the
  /// wrist down.
  private func scheduleRestTimer() {
    restTimer?.invalidate()
    restTimer = nil
    guard let end = restEndsAt else { return }
    let left = end.timeIntervalSinceNow
    guard left > 0 else { return }
    let first = end.addingTimeInterval(-left.rounded(.down))
    let timer = Timer(fire: first, interval: 1, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.restTick() }
    }
    RunLoop.main.add(timer, forMode: .common)
    restTimer = timer
  }

  private func playRestHaptic() {
    WKInterfaceDevice.current().play(.notification)
  }

  // MARK: Mirroring — apply the phone's pushed state

  /// Merge a decoded state snapshot from the phone. Only the fields the phone
  /// owns are overwritten; locally-edited weight/reps are replaced only when the
  /// current set changed (a new set means new seed values).
  func apply(_ s: PhoneState) {
    // The workout's own start beats our session's, and updates the clock at once
    // rather than at the next tick — otherwise the Watch shows a visibly wrong
    // elapsed for up to a second every time it joins a session already running.
    if let started = s.startedAt, started != elapsedOrigin {
      elapsedOrigin = started
      tick()
    }

    screen = s.screen
    // Once the phone has moved us off Start, any pending hand-off is resolved.
    if s.screen != .start { pendingRoutineId = nil }
    // Only when the push actually carried them. Mid-workout pushes don't, and
    // overwriting here left the Start screen empty the next time it appeared.
    if let pushed = s.routines { routines = pushed }
    routineName = s.routineName
    equipment = s.equipment
    supersetLabel = s.supersetLabel
    setCount = s.setCount
    prevWeight = s.prevWeight
    prevReps = s.prevReps
    setDots = s.setDots
    nextSetLabel = s.nextSetLabel
    restTotal = s.restTotal
    volumeKg = s.volumeKg
    setsDone = s.setsDone
    setsTotal = s.setsTotal
    summary = s.summary

    // A changed exercise/set always reseeds the Crown-editable values — a new set
    // means new seed values.
    let setChanged = s.exerciseName != exerciseName || s.setNum != setNum
    // So does an edit the phone made to the set we are already on (#30). This
    // used to be ignored entirely, so typing a weight on the phone before
    // ticking the set off left the Watch showing the old number. The one thing
    // that outranks the phone is a wrist mid-turn; that edit lands once the
    // Crown goes quiet, or when the set changes.
    let pushedEdit = !setChanged && !crownIsBusy && (s.weight != weight || s.reps != reps)
    if setChanged || pushedEdit {
      weight = s.weight
      reps = s.reps
      if setChanged { lastCrownEdit = nil }
      valueSeed &+= 1
    }
    exerciseName = s.exerciseName
    setNum = s.setNum

    // Rest is phone-authoritative: it says whether one is running and when it
    // ends. With an end date the countdown is derived from it here; without one
    // (nothing to count down to) the pushed seconds are displayed as-is.
    let now = Date()
    let end = s.resting ? s.restEndsAt : nil
    let retimed = end != restEndsAt
    restEndsAt = end
    if end == nil {
      resting = s.resting
      restRemaining = s.restRemaining
    }
    // Every push goes through the alarm, which is what makes a repeated push
    // harmless, a skip silent, and an adjusted rest buzz at its new end.
    if restAlarm.update(resting: s.resting, endsAt: s.restEndsAt, alertsOn: s.restAlerts, now: now) {
      playRestHaptic()
    }
    if end != nil { restTick() }
    if retimed { scheduleRestTimer() }
  }
}
