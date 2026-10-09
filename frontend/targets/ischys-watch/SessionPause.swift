import Foundation

/// Pause and Resume for the Watch's workout session.
///
/// Controls had a Pause button and nothing that undid it. The session was
/// paused, the button went on saying "Pause", and the rest of the workout was
/// not measured: a 58-second workout paused at 16 seconds reached Health as a
/// 16-second one.
///
/// What a pause means, here and in what is saved:
///
/// - The workout itself is the phone's. Its clock does not stop, on the phone
///   or in the Watch's "ELAPSED", and its duration is start to finish.
/// - The Watch's session is what measures: heart rate and energy. Pausing it
///   stops the measuring, as on the Wear OS app.
/// - The Health entry the Watch saves starts and ends when the workout did, so
///   it lines up with the phone's. HealthKit records the pause inside it and
///   reports the time spent paused as not worked — its "workout time" is
///   shorter than its span, by exactly what was paused. That is HealthKit's
///   own meaning of a pause and is left as it is.
///
/// A pause that is forgotten is the remaining way to lose most of a workout,
/// so logging a set ends it: nobody is resting from a workout they are
/// logging sets in.
///
/// Plain Foundation, so it is compiled and tested on a Mac
/// (scripts/test-watch-logic.sh).
struct SessionPause {
  /// The session is paused. Set from what HealthKit reports, not from the
  /// tap, so the button never claims a state the session is not in.
  private(set) var paused = false

  enum Action: Equatable {
    case pause
    case resume
  }

  /// What the Controls button does now, and so what it says.
  var toggle: Action { paused ? .resume : .pause }

  /// HealthKit reported the session's state.
  mutating func sessionChanged(paused now: Bool) { paused = now }

  /// The session ended, or a new one began: nothing is paused.
  mutating func reset() { paused = false }

  /// Whether a change in the number of sets logged should resume the session.
  /// Only a set gained while paused: a set unticked, or the first state a new
  /// session is sent, is not the user getting back to work.
  func resumesOnSets(from before: Int, to after: Int) -> Bool {
    paused && after > before
  }
}
