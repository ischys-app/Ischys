import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

type ExactAlarmNativeModule = {
  canSchedule(): boolean;
  openSettings(): boolean;
};

const native = requireOptionalNativeModule<ExactAlarmNativeModule>('ExactAlarm');

/**
 * Whether a scheduled notification will fire on time. Only Android can say no:
 * from Android 14 an app may set exact alarms only once the user has allowed it
 * under "Alarms & reminders". True everywhere else, and where the module is
 * missing, so nothing prompts for a switch that does not exist.
 */
export function canScheduleExactAlarms(): boolean {
  if (Platform.OS !== 'android' || !native) return true;
  try {
    return native.canSchedule();
  } catch {
    return true;
  }
}

/** Opens Android's "Alarms & reminders" page for Ischys. False if it could not. */
export function openExactAlarmSettings(): boolean {
  if (Platform.OS !== 'android' || !native) return false;
  try {
    return native.openSettings();
  } catch {
    return false;
  }
}
