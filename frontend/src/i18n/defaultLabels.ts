/**
 * Display labels for English defaults that are stored in the database.
 * Pure: safe under node --test. The stored value is never changed; only what
 * is shown. Comparisons (`=== DEFAULT_NAME`) must stay on the raw value.
 */
import { t } from './t.ts';

/** Mirrors `DEFAULT_NAME` in lib/activeProfile.ts (not imported: that file pulls in React). */
const DEFAULT_PROFILE_NAME = 'Athlete';

/** The stored default names ('Workout', 'Empty Workout') or a blank are shown translated; any other name is user data. */
export function workoutLabel(name: string | null | undefined): string {
  if (!name || name === 'Workout') return t('workout.defaultName');
  if (name === 'Empty Workout') return t('workout.emptyName');
  return name;
}

/** The stored default profile name is shown translated; any other name is user data. */
export function profileNameLabel(name: string): string {
  return name === DEFAULT_PROFILE_NAME ? t('profile.defaultName') : name;
}
