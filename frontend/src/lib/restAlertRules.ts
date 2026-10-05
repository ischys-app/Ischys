/**
 * Pure decisions for the rest-timer alert. No imports, so `node --test` can run
 * them without resolving expo-notifications. See restAlertRules.test.ts.
 */

/** Rest of 0s means "Off" (a real picker option) or a skip. Never schedule those. */
export function shouldSchedule(alertsEnabled: boolean, seconds: number): boolean {
  return alertsEnabled && seconds > 0;
}

/**
 * How the Watch recognises this notification when iOS forwards it to the wrist.
 * The Watch app buzzes for the end of a rest itself, so it mutes the forwarded
 * copy rather than tapping twice (#82). Both strings are matched verbatim in
 * targets/ischys-watch/RestAlertMute.swift; the test keeps the two in step.
 */
export const REST_ALERT_CATEGORY = 'rest-complete';
export const REST_ALERT_TITLE = 'Rest complete';

export function alertBody(exerciseName: string | null | undefined): string {
  return exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set';
}
