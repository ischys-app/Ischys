import ActivityKit
import ExpoModulesCore

/// Thin bridge over ActivityKit. All the interesting behaviour (the countdown,
/// the progress bar) happens on-device in the widget via `Text(timerInterval:)`,
/// so this only has to start, update and end the Activity.
public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")
    Events("onActions")

    // A card button runs its intent in this process and posts a Darwin
    // notification. We only signal JS; JS then drains the queue itself, so an
    // action is applied exactly once whether it arrives live or on resume.
    OnCreate {
      LiveActivityObserver.shared.onPost = { [weak self] in
        self?.sendEvent("onActions", [:])
      }
      LiveActivityObserver.shared.start()
    }

    OnDestroy {
      LiveActivityObserver.shared.stop()
    }

    /// Returns every queued card action and clears the queue.
    Function("consumeActions") { () -> [[String: Any]] in
      LiveActivityActionQueue.drain()
    }

    Function("isSupported") { () -> Bool in
      guard #available(iOS 16.1, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    Function("start") { (workoutStartedAt: Double, state: [String: Any]) -> String? in
      guard #available(iOS 16.1, *) else { return nil }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

      // Only one workout Activity at a time.
      for activity in Activity<WorkoutAttributes>.activities {
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
      }

      do {
        let activity = try Activity.request(
          attributes: WorkoutAttributes(
            workoutStartedAt: Date(timeIntervalSince1970: workoutStartedAt / 1000)
          ),
          content: .init(state: Self.decode(state), staleDate: nil)
        )
        return activity.id
      } catch {
        return nil
      }
    }

    AsyncFunction("update") { (state: [String: Any]) in
      guard #available(iOS 16.1, *) else { return }
      for activity in Activity<WorkoutAttributes>.activities {
        await activity.update(.init(state: Self.decode(state), staleDate: nil))
      }
    }

    AsyncFunction("end") {
      guard #available(iOS 16.1, *) else { return }
      for activity in Activity<WorkoutAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  fileprivate static func decode(_ dict: [String: Any]) -> WorkoutAttributes.ContentState {
    func date(_ key: String) -> Date? {
      // JS sends epoch milliseconds.
      guard let ms = dict[key] as? Double else { return nil }
      return Date(timeIntervalSince1970: ms / 1000)
    }
    return WorkoutAttributes.ContentState(
      exerciseName: dict["exerciseName"] as? String ?? "",
      mode: dict["mode"] as? String ?? "logging",
      subtitle: dict["subtitle"] as? String ?? "",
      weightLabel: dict["weightLabel"] as? String ?? "",
      repsLabel: dict["repsLabel"] as? String ?? "",
      restStartedAt: date("restStartedAt"),
      restEndsAt: date("restEndsAt"),
      setId: dict["setId"] as? String,
      // JS numbers cross the bridge as Double (see `date()` above); reading this
      // as Int alone always failed and left restSeconds 0, so the card's
      // optimistic rest ended instantly and never visibly started.
      restSeconds: (dict["restSeconds"] as? Int) ?? Int(dict["restSeconds"] as? Double ?? 0),
      next: decodeNext(dict["next"] as? [String: Any])
    )
  }

  private static func decodeNext(_ dict: [String: Any]?) -> WorkoutAttributes.NextSet? {
    guard let dict else { return nil }
    return WorkoutAttributes.NextSet(
      exerciseName: dict["exerciseName"] as? String ?? "",
      subtitle: dict["subtitle"] as? String ?? "",
      weightLabel: dict["weightLabel"] as? String ?? "",
      repsLabel: dict["repsLabel"] as? String ?? "",
      setId: dict["setId"] as? String
    )
  }
}

/// Bridges the Darwin notification an intent posts into an Expo event.
///
/// App-side only — the widget has no JS to notify, so this is not one of the
/// files `npm run lint:la` keeps in sync.
final class LiveActivityObserver {
  static let shared = LiveActivityObserver()

  var onPost: (() -> Void)?
  private var observing = false

  private var local: NSObjectProtocol?

  func start() {
    guard !observing else { return }
    observing = true

    // The path that actually fires: a LiveActivityIntent runs in this process.
    local = NotificationCenter.default.addObserver(
      forName: LiveActivityNotifier.localName,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.onPost?()
    }

    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let me = Unmanaged<LiveActivityObserver>.fromOpaque(observer).takeUnretainedValue()
        // Darwin callbacks land on a background thread; Expo events want main.
        DispatchQueue.main.async { me.onPost?() }
      },
      LiveActivityNotifier.darwinName,
      nil,
      .deliverImmediately
    )
  }

  func stop() {
    guard observing else { return }
    observing = false
    if let local {
      NotificationCenter.default.removeObserver(local)
      self.local = nil
    }
    CFNotificationCenterRemoveEveryObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque()
    )
  }
}
