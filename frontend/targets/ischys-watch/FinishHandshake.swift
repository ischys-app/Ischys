import Foundation

/// What the Watch does between Finish being tapped and the phone saying how the
/// finish went (#95).
///
/// Finish used to end the `HKWorkoutSession`, save the recording to Health and
/// return to Start at once, and only then ask the phone to finish. When the
/// phone's finish failed, the workout was still running there while the Watch
/// had stopped and saved: resuming made a second Health recording, and the
/// wrist sat on Start in the middle of a workout.
///
/// So the Watch asks first and keeps recording until it hears. This holds that
/// rule and nothing else — no timer, no WatchConnectivity, no HealthKit — so it
/// can be compiled and tested on a Mac (scripts/test-watch-logic.sh). The caller
/// feeds it the tap, the phone's answer and the clock, and does what each call
/// returns.
///
/// Every request has an id and the phone's answer repeats it. That is what
/// makes an answer safe to arrive twice, late, or after the timeout: only the
/// answer to the request still being waited on does anything.
struct FinishHandshake {
  /// How long to wait for the phone's answer before ending and saving anyway.
  ///
  /// The answer needs the phone app to be woken (it may have been terminated,
  /// which means launching it and loading its JS), to write the finish, and to
  /// reply: under a second when the app is alive, a few seconds from cold. Past
  /// that, an answer is unlikely to come at all, and someone at the gym is
  /// looking at a spinner. Giving up means doing what Finish always did, so the
  /// cost of a timeout is the old behaviour, never a lost recording.
  ///
  /// The phone waits for the "saved" confirmation for longer than this
  /// (`watchSaveWaitMs` in src/lib/watchFinish.ts, which mirrors this number),
  /// so a Watch that gives up still confirms in time to stop the phone writing
  /// a second Health entry. Change the two together.
  static let verdictTimeout: TimeInterval = 8

  /// The phone's answer, as it travels (`finishVerdict` in the message).
  enum Verdict: String {
    case finished
    case failed
  }

  /// What to do when Finish is tapped.
  enum Start: Equatable {
    /// Send the request with this id and show that the finish is under way.
    case ask
    /// The phone cannot be asked. End and save now, and queue the request for
    /// when it can be reached — what Finish did before there was a handshake.
    case endNow
    /// Already waiting on an earlier tap.
    case ignore
  }

  /// What to do after an answer, a clock tick or a delivery failure.
  enum Step: Equatable {
    case none
    /// End the session and save the recording.
    case endAndSave
    /// As `endAndSave`, and queue the finish request: the phone never got it.
    case endAndQueueRequest
    /// The finish failed on the phone. Leave the session running and say so.
    case keepRecording
    /// Queue the finish request and nothing else: the session was already
    /// ended and saved when the wait ran out, and only now is it known that
    /// the phone never got the request.
    case queueRequest
  }

  /// The request being waited on, if any.
  private var pending: String?
  /// When to stop waiting. nil when not waiting.
  private(set) var deadline: Date?
  /// The request the wait ran out on, until it is known whether the phone got
  /// it. A delivery failure can be reported after the timeout (reachability
  /// was stale as the phone went out of range), and by then the Watch has
  /// ended and saved with nothing queued: without this the phone would never
  /// hear of the finish and would keep the workout running.
  private var gaveUpOn: String?

  var isWaiting: Bool { pending != nil }

  /// Finish was tapped. `phoneReachable` is whether a message sent now would be
  /// delivered now rather than queued.
  mutating func begin(id: String, now: Date, phoneReachable: Bool) -> Start {
    guard pending == nil else { return .ignore }
    // A queued request is answered whenever the phone next runs, which may be
    // hours away. Waiting on it would only be a timeout with a spinner.
    guard phoneReachable else { return .endNow }
    pending = id
    deadline = now.addingTimeInterval(Self.verdictTimeout)
    // A new request: the last one's delivery is no longer of interest, and a
    // finish queued for it now would land on this workout.
    gaveUpOn = nil
    return .ask
  }

  /// The phone answered request `id`.
  mutating func verdict(_ verdict: Verdict, id: String) -> Step {
    // An answer, however late, means the phone has the request.
    if id == gaveUpOn { gaveUpOn = nil }
    guard id == pending else { return .none }
    settle()
    switch verdict {
    case .finished: return .endAndSave
    case .failed: return .keepRecording
    }
  }

  /// Feed a clock tick. Ends the wait once the deadline has passed.
  mutating func poll(now: Date) -> Step {
    guard let pending, let deadline else { return .none }
    guard now >= deadline else { return .none }
    settle()
    gaveUpOn = pending
    return .endAndSave
  }

  /// Request `id` could not be delivered after all, so no answer is coming.
  mutating func undeliverable(id: String) -> Step {
    if id == gaveUpOn {
      gaveUpOn = nil
      return .queueRequest
    }
    guard id == pending else { return .none }
    settle()
    return .endAndQueueRequest
  }

  /// The session ended some other way — the phone finished or discarded the
  /// workout itself — so there is nothing left to wait for.
  ///
  /// A request already given up on is kept: giving up ends the session, which
  /// is what calls this, and its delivery failure may still be on the way.
  mutating func cancel() { settle() }

  private mutating func settle() {
    pending = nil
    deadline = nil
  }
}
