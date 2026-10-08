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
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { canScheduleExactAlarms, openExactAlarmSettings } from '../../modules/exact-alarm';

import {
  REST_ALERT_CATEGORY,
  REST_ALERT_TITLE,
  alertBody,
  shouldAskForExactAlarms,
} from './restAlertRules';

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

/**
 * Android delivers through a channel, and from Android 13 the permission prompt
 * does not appear at all until the app owns one — so it is created before asking.
 */
const ANDROID_CHANNEL_ID = 'rest-timer';

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Rest timer',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });
}

/** Ask once. Returns false if the user declined — we then simply never schedule. */
export async function ensureAlertPermission(): Promise<boolean> {
  await ensureAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

const KEY_EXACT_ALARM_ASKED = 'ischys.exactAlarmAsked';

/**
 * Android 14+ only delivers a scheduled notification on time if the user has
 * let the app set alarms; otherwise the alert can trail the end of the rest by
 * over a minute. This explains that and opens the switch.
 *
 * Asks once on its own. `force` is for a deliberate act — turning the alerts
 * setting on — where asking again is the answer to what the user just did.
 */
export async function maybeAskForExactAlarms(
  alertsGranted: boolean,
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  try {
    const asked = !force && (await SecureStore.getItemAsync(KEY_EXACT_ALARM_ASKED)) !== null;
    if (!shouldAskForExactAlarms(alertsGranted, canScheduleExactAlarms(), asked)) return;
    await SecureStore.setItemAsync(KEY_EXACT_ALARM_ASKED, new Date().toISOString());
    Alert.alert(
      'Rest alerts on time',
      'Android can delay the end-of-rest alert by a minute or more unless Ischys is allowed to set alarms. Turn on "Alarms & reminders" for Ischys to get it on the second.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => void openExactAlarmSettings() },
      ],
    );
  } catch {
    // A late alert is the worst case here; never let the prompt break a workout.
  }
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
        title: REST_ALERT_TITLE,
        body: alertBody(exerciseName),
        // No actions are registered for it; it only names the notification so
        // the Watch can tell it from any other and mute its forwarded copy.
        categoryIdentifier: REST_ALERT_CATEGORY,
        sound: true,
        interruptionLevel: 'timeSensitive',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds,
        repeats: false,
        channelId: ANDROID_CHANNEL_ID,
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
