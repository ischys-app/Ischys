import Foundation

/// Tracks the ending of one workout session: whether it has been asked to
/// end, whether its recording is to be thrown away, and what to do if
/// HealthKit never says it ended.
///
/// Ending is asked for once and confirmed later, by the session's delegate.
/// Two things went wrong around that gap:
///
/// - Discard on the wrist ends the session and tells the phone, and a phone
///   with the workout on screen answers with a discard command of its own. That
///   second request called `end()` on a session already ending, which HealthKit
///   rejects as an invalid transition.
/// - Twice, the delegate was never told the session had ended. Everything that
///   follows hangs on that callback, so the Watch went on believing a session
///   was running: no later workout could start one (no heart rate, no
///   recording), and the recording that should have been discarded was still
///   open, to be saved to Health when the app was next closed.
///
/// So a second request is absorbed here, and a request that goes unconfirmed
/// for `timeout` is cleaned up as if it had been confirmed.
///
/// Plain Foundation, no HealthKit, so it is compiled and tested on a Mac
/// (scripts/test-watch-logic.sh). `WorkoutManager` holds one per session.
struct SessionEnd {
  /// How long HealthKit gets to confirm an end before it is taken as read. A
  /// confirmation normally arrives in about two seconds: the session waits for
  /// the last sensor data first.
  static let timeout: TimeInterval = 6

  /// When the end was asked for; nil while the session is simply running.
  private(set) var requestedAt: Date?
  /// The recording is thrown away, not saved.
  private(set) var discard = false
  /// The end has been dealt with, by the delegate or by the timeout.
  private(set) var settled = false

  var isEnding: Bool { requestedAt != nil && !settled }

  /// End was asked for. True when the session should actually be told to end:
  /// the first time only.
  ///
  /// A discard is never undone by a later plain end. A recording the user
  /// threw away must not be saved because a "stop" arrived behind it; the
  /// other way round, a discard that follows an end still discards.
  mutating func request(discard wanted: Bool, now: Date) -> Bool {
    if settled { return false }
    if wanted { discard = true }
    if requestedAt != nil { return false }
    requestedAt = now
    return true
  }

  /// What to do with the recording, once: the session reported that it ended,
  /// or `timedOut` said to stop waiting. nil when it has been dealt with
  /// already, so a confirmation that turns up after the timeout does nothing.
  ///
  /// `tooShort`: a session of under three seconds is the phone's launch
  /// hand-off starting and dropping one, and is not saved either.
  mutating func settle(tooShort: Bool = false) -> Outcome? {
    if settled { return nil }
    settled = true
    return discard || tooShort ? .discard : .save
  }

  /// Whether an end asked for has gone unconfirmed for too long. A clock set
  /// back must not make the wait longer than `timeout`, so a request dated in
  /// the future counts from now.
  func timedOut(now: Date) -> Bool {
    guard let asked = requestedAt, !settled else { return false }
    let waited = now.timeIntervalSince(asked)
    return waited >= Self.timeout || waited < 0
  }

  enum Outcome: Equatable {
    case save
    case discard
  }
}
