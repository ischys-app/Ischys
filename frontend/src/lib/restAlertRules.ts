/**
 * Pure decisions for the rest-timer alert. No imports, so `node --test` can run
 * them without resolving expo-notifications. See restAlertRules.test.ts.
 */

/** Rest of 0s means "Off" (a real picker option) or a skip. Never schedule those. */
export function shouldSchedule(alertsEnabled: boolean, seconds: number): boolean {
  return alertsEnabled && seconds > 0;
}

export function alertBody(exerciseName: string | null | undefined): string {
  return exerciseName ? `Next set: ${exerciseName}` : 'Time for your next set';
}
