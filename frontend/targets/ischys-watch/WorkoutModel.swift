import Combine
import Foundation

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

  // S3 — Rest. `restRemaining` ticks locally; the phone owns start/total.
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

  // MARK: Local ticks

  private var restTimer: AnyCancellable?
  private var elapsedTimer: AnyCancellable?

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
  }

  private func tick() {
    // Only elapsed ticks locally. Rest is NOT decremented here: the phone pushes
    // restRemaining every second, and ticking it too would run it down twice as
    // fast. The elapsed clock is local because the phone doesn't push it.
    if let start = elapsedOrigin {
      elapsedSec = max(0, Int(Date().timeIntervalSince(start)))
    }
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
    routines = s.routines
    routineName = s.routineName
    equipment = s.equipment
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

    // Rest is fully phone-authoritative — pushed every second, displayed as-is.
    resting = s.resting
    restRemaining = s.restRemaining
  }
}
