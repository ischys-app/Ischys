import ActivityKit
import Foundation

// ⚠️ Compiled into BOTH the app (via modules/live-activity) and the widget
// extension. `npm run lint:la` keeps the copies byte-identical.
//
// A card button does two things: it nudges the Activity so the card reacts at
// once, and it queues the action for JS. JS stays the single source of truth --
// it owns carry-forward and persistence, and the extension never mutates state
// directly.

enum LiveActivityAction: String {
  case skipRest
  case adjustRest
  case completeSet
}

/// Cross-process queue in the shared App Group. The intent appends; JS drains.
enum LiveActivityActionQueue {
  static let appGroup = "group.app.ischys.mobile"
  private static let key = "pendingActions"

  private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  static func append(_ action: LiveActivityAction, setId: String? = nil, seconds: Int = 0) {
    guard let defaults else { return }
    var queue = defaults.array(forKey: key) as? [[String: Any]] ?? []

    // `setId` is only present for completeSet. It must be OMITTED when nil, not
    // written as `nil as Any`: that is not a property-list object, and
    // UserDefaults.set raises NSInvalidArgumentException — killing the app
    // process on every Skip and ±15s.
    var entry: [String: Any] = [
      "action": action.rawValue,
      "seconds": seconds,
      "at": Date().timeIntervalSince1970 * 1000,
    ]
    if let setId { entry["setId"] = setId }

    queue.append(entry)
    defaults.set(queue, forKey: key)
  }

  /// Returns everything queued and clears it, so an action is applied once.
  static func drain() -> [[String: Any]] {
    guard let defaults else { return [] }
    let queue = defaults.array(forKey: key) as? [[String: Any]] ?? []
    defaults.removeObject(forKey: key)
    return queue
  }
}

/// Wakes the app's JS side.
///
/// A LiveActivityIntent runs in the app's process, so the in-process post is
/// the one that actually delivers. The Darwin post is the belt-and-braces path
/// for anything that ever runs in the extension.
enum LiveActivityNotifier {
  static let darwinName = "app.ischys.mobile.liveActivityAction" as CFString
  static let localName = Notification.Name("app.ischys.mobile.liveActivityAction")

  static func post() {
    NotificationCenter.default.post(name: localName, object: nil)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(darwinName),
      nil,
      nil,
      true
    )
  }
}

/// Optimistic edits so the card responds instantly, before JS reconciles.
/// JS remains authoritative and overwrites these the moment it runs.
@available(iOS 16.1, *)
enum LiveActivityMutator {
  private static func mutate(
    _ transform: @escaping (inout WorkoutAttributes.ContentState) -> Void
  ) async {
    for activity in Activity<WorkoutAttributes>.activities {
      var state = activity.content.state
      transform(&state)
      await activity.update(.init(state: state, staleDate: nil))
    }
  }

  static func skipRest() async {
    await mutate { state in
      state.mode = "logging"
      state.restStartedAt = nil
      state.restEndsAt = nil
    }
  }

  /// Never rewinds past now — a countdown that has already fired cannot un-fire.
  static func adjustRest(by seconds: Int) async {
    await mutate { state in
      guard let end = state.restEndsAt else { return }
      state.restEndsAt = max(Date(), end.addingTimeInterval(TimeInterval(seconds)))
    }
  }

  /// Rolls the card into rest for the set after this one. The labels were put
  /// in `next` by JS, so nothing here has to understand carry-forward.
  ///
  /// Only the tapped set is completed, and only once: if `setId` no longer
  /// matches, JS has already moved on and this tap is stale.
  static func completeSet(_ setId: String) async {
    await mutate { state in
      guard state.setId == setId else { return }

      let now = Date()
      state.mode = "rest"
      state.restStartedAt = now
      state.restEndsAt = now.addingTimeInterval(TimeInterval(state.restSeconds))

      // `next` is nil when JS has not yet pushed since the last completion. Rest
      // still starts — otherwise this tap, and the Skip after it, look dead —
      // and the ✓ disables itself (setId nil) until JS refills the labels.
      guard let next = state.next else {
        state.setId = nil
        return
      }

      state.exerciseName = next.exerciseName
      state.subtitle = next.subtitle
      state.weightLabel = next.weightLabel
      state.repsLabel = next.repsLabel
      state.setId = next.setId
      // JS recomputes `next` when it pushes the authoritative state.
      state.next = nil
    }
  }
}
