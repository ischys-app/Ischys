import Foundation

/// Which screen the Watch shows. Foundation-only so the rules around it can be
/// tested on the Mac (scripts/watch-tests/WatchScreenTests.swift).
enum WatchScreen {
  case start    // S1 — pick a routine / empty
  case session  // S2/S3/S4/S5 — the paged workout
  case summary  // S6
  /// Another profile is active on the phone. Health and the Watch are the
  /// owner's alone, so the Watch shows a message and records nothing.
  case off

  /// The screen a pushed state names. Anything unknown or missing is Start.
  init(wire: String?) {
    switch wire {
    case "session": self = .session
    case "summary": self = .summary
    case "off": self = .off
    default: self = .start
    }
  }

  /// Whether an `HKWorkoutSession` may start while this screen is showing.
  var allowsSession: Bool { self != .off }

  /// The off screen's message. A long name is left whole for the view to wrap;
  /// a blank one (the phone sends the first name, which can be empty) reads as
  /// "this profile".
  static func offTitle(profileName: String) -> String {
    let name = profileName.trimmingCharacters(in: .whitespacesAndNewlines)
    return name.isEmpty ? "Watch is off for this profile" : "Watch is off for \(name)"
  }
}
