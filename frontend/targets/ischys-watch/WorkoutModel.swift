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
  private var sessionStart: Date?

  /// Drives the 1 Hz rest countdown and the elapsed clock while a session runs.
  func startTicking(sessionStart: Date) {
    self.sessionStart = sessionStart
    elapsedTimer = Timer.publish(every: 1, on: .main, in: .common)
      .autoconnect()
      .sink { [weak self] _ in self?.tick() }
  }

  func stopTicking() {
    elapsedTimer?.cancel()
    elapsedTimer = nil
    sessionStart = nil
  }

  private func tick() {
    // Only elapsed ticks locally. Rest is NOT decremented here: the phone pushes
    // restRemaining every second, and ticking it too would run it down twice as
    // fast. The elapsed clock is local because the phone doesn't push it.
    if let start = sessionStart {
      elapsedSec = max(0, Int(Date().timeIntervalSince(start)))
    }
  }

  // MARK: Mirroring — apply the phone's pushed state

  /// Merge a decoded state snapshot from the phone. Only the fields the phone
  /// owns are overwritten; locally-edited weight/reps are replaced only when the
  /// current set changed (a new set means new seed values).
  func apply(_ s: PhoneState) {
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

    // A changed exercise/set reseeds the Crown-editable values; an unchanged set
    // keeps the user's local Crown edit.
    if s.exerciseName != exerciseName || s.setNum != setNum {
      weight = s.weight
      reps = s.reps
    }
    exerciseName = s.exerciseName
    setNum = s.setNum

    // Rest is fully phone-authoritative — pushed every second, displayed as-is.
    resting = s.resting
    restRemaining = s.restRemaining
  }
}
