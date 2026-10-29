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

  /// Whether a session already recording must end when the phone pushes this
  /// screen: one started before the Watch knew another profile was active is
  /// not the owner's workout. It is discarded, so nothing reaches Health.
  var endsRunningSession: Bool { self == .off }

  /// The off screen's message. A long name is left whole for the view to wrap;
  /// a blank one (the phone sends the first name, which can be empty) reads as
  /// "this profile".
  static func offTitle(profileName: String) -> String {
    let name = profileName.trimmingCharacters(in: .whitespacesAndNewlines)
    return name.isEmpty ? "Watch is off for this profile" : "Watch is off for \(name)"
  }
}

/// Whom the Watch was last told it is off for, kept across launches. A Watch
/// relaunched with the phone out of reach hears nothing until it is back, and
/// must not open on a Start screen another profile's workout could be
/// recorded from. Nothing remembered (the phone last said on, or never said)
/// opens on Start as before, so the owner can still start a workout offline.
struct OffMemory {
  static let key = "ischys.offFor"
  static var standard: OffMemory { OffMemory(defaults: .standard) }

  let defaults: UserDefaults

  /// The profile's name while off (possibly blank); nil while on.
  var offFor: String? { defaults.string(forKey: Self.key) }

  /// The screen to open on before the phone has pushed anything.
  var launchScreen: WatchScreen { offFor == nil ? .start : .off }

  /// Records what a pushed state says. Writes only on a change.
  func remember(screen: WatchScreen, profileName: String) {
    let next: String? = screen == .off ? profileName : nil
    guard next != offFor else { return }
    if let next { defaults.set(next, forKey: Self.key) } else { defaults.removeObject(forKey: Self.key) }
  }
}
