import Foundation
import UserNotifications

/// Keeps the wrist from tapping twice at the end of a rest (#82).
///
/// The phone still schedules its "Rest complete" notification — it is the only
/// alert when no Watch is worn — and iOS forwards it to the Watch whenever the
/// phone is locked and idle. The Watch app now buzzes for the same moment
/// itself, so the forwarded copy is a duplicate.
///
/// watchOS asks the app how to present a notification that arrives while the
/// app is frontmost, which is where an active workout keeps us. Answering "not
/// at all" for this one notification, and only while `RestAlarm` has buzzed or
/// is about to, leaves our own haptic as the single tap. Anything else is
/// presented as usual.
///
/// This does not cover a notification the system presents without asking us.
/// The phone cannot mark a notification as "do not forward", so if watchOS
/// handles one itself the wrist gets the system's tap next to ours, at the same
/// moment. That is the accepted failure: an extra tap, never a missing one.
final class RestAlertMute: NSObject, UNUserNotificationCenterDelegate {
  static let shared = RestAlertMute()

  // Must match REST_ALERT_CATEGORY and REST_ALERT_TITLE in
  // src/lib/restAlertRules.ts — restAlertRules.test.ts checks that they do. The
  // title is the fallback in case the category does not survive forwarding.
  private static let category = "rest-complete"
  private static let title = "Rest complete"

  func install() {
    UNUserNotificationCenter.current().delegate = self
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    let content = notification.request.content
    let isRestAlert = content.categoryIdentifier == Self.category || content.title == Self.title
    guard isRestAlert else {
      completionHandler([.banner, .list, .sound])
      return
    }
    DispatchQueue.main.async {
      let ours = WorkoutModel.shared.ownsRestBuzz
      completionHandler(ours ? [] : [.banner, .list, .sound])
    }
  }
}
