/**
 * Rest-timer alert: a local notification scheduled for the end of the rest.
 *
 * Not an in-app sound. The screen's `setInterval` stops running the moment iOS
 * suspends the app, which is exactly when you are resting — phone in pocket,
 * screen off. iOS delivers a scheduled notification regardless, and the
 * foreground handler makes it also fire while you are looking at the screen.
 *
 * Honours the existing `rest_timer_alerts` setting, which until now nothing read.
 *
 * The two decision functions are pure and tested; the scheduling calls are thin.
 * See restAlert.test.ts.
 */
import * as Notifications from 'expo-notifications';

import { alertBody } from './restAlertRules';

export { alertBody, shouldSchedule } from './restAlertRules';

/** Banner + sound even while the app is foregrounded. */
export function installRestAlertHandler(): void {
  Notifications.setNotificationHandler({
    // `shouldShowAlert` is deprecated in SDK 57 in favour of banner/list.
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Ask once. Returns false if the user declined — we then simply never schedule. */
export async function ensureAlertPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

/** Schedule the end-of-rest alert. Returns its id so it can be cancelled. */
export async function scheduleRestAlert(
  seconds: number,
  exerciseName: string | null,
): Promise<string | null> {
  if (seconds <= 0) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest complete',
        body: alertBody(exerciseName),
        sound: true,
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
      },
    });
  } catch {
    return null; // a missing permission must never break logging a set
  }
}

export async function cancelRestAlert(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or already cancelled — nothing to do.
  }
}
