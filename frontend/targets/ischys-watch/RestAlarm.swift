import Foundation

/// Decides when the wrist buzzes for the end of a rest (#82).
///
/// The Watch used to play no haptic of its own: the only end-of-rest signal was
/// the phone's notification, which iOS forwards to the wrist only while the
/// phone is locked and idle. So it buzzed for some rests and not for others.
///
/// This holds the rule and nothing else — no timer, no WatchKit — so it can be
/// compiled and tested on a Mac (scripts/test-watch-logic.sh). The caller
/// feeds it every state the phone pushes and every clock tick, and plays the
/// haptic whenever a call returns true.
///
/// It keys on the rest's *end date*, never on the pushed seconds remaining: the
/// phone pushes those once a second only while its JS is running, and a locked
/// phone stops. An end date also makes "exactly once" simple — a rest is its end
/// date, so a repeated push or a redraw cannot buzz twice, and an extended or
/// shortened rest is just a different date to wait for.
struct RestAlarm {
  /// How close to the end a "rest is over" push must land to count as the rest
  /// running out rather than being skipped. The phone notices the end on a 1 Hz
  /// tick, on its own clock, so its push can beat our timer by a fraction of a
  /// second; without this that rest would end silently. The cost is that a Skip
  /// tapped in the final second buzzes too.
  static let completionSlack: TimeInterval = 1

  /// A buzz this long after the fact is noise, not a cue. Reached only if we
  /// were not running at the end (no workout session keeping us alive) or learn
  /// of a rest after it finished.
  static let maxLateness: TimeInterval = 5

  /// How long after buzzing we still claim the phone's forwarded notification
  /// as a duplicate of our own (see `RestAlertMute`).
  static let ownershipWindow: TimeInterval = 10

  /// The end date we are waiting for, if any.
  private(set) var armedFor: Date?
  /// The last end date dealt with, buzzed or deliberately not.
  private var handled: Date?
  private var firedAt: Date?

  /// Feed a state pushed by the phone. Returns true when the wrist should buzz
  /// now.
  mutating func update(resting: Bool, endsAt: Date?, alertsOn: Bool, now: Date) -> Bool {
    guard alertsOn else {
      armedFor = nil
      return false
    }
    guard resting, let endsAt else { return restEnded(now: now) }
    // The same rest pushed again after we already buzzed for it.
    if endsAt == handled {
      armedFor = nil
      return false
    }
    armedFor = endsAt
    return poll(now: now)
  }

  /// Feed a clock tick. Returns true when the wrist should buzz now.
  mutating func poll(now: Date) -> Bool {
    guard let end = armedFor, now >= end else { return false }
    armedFor = nil
    return complete(end, now: now)
  }

  /// Drop whatever is pending without buzzing — the workout ended.
  mutating func cancel() { armedFor = nil }

  /// Whether a rest-complete notification arriving now duplicates a buzz we
  /// have just played or are about to.
  func owns(now: Date) -> Bool {
    if armedFor != nil { return true }
    guard let firedAt else { return false }
    return abs(now.timeIntervalSince(firedAt)) <= Self.ownershipWindow
  }

  /// The phone says no rest is running. Skipped or cancelled, unless it is the
  /// armed rest finishing a moment ahead of our own timer.
  private mutating func restEnded(now: Date) -> Bool {
    guard let end = armedFor else { return false }
    armedFor = nil
    guard now >= end.addingTimeInterval(-Self.completionSlack) else { return false }
    return complete(end, now: now)
  }

  private mutating func complete(_ end: Date, now: Date) -> Bool {
    handled = end
    guard now.timeIntervalSince(end) <= Self.maxLateness else { return false }
    firedAt = now
    return true
  }
}
