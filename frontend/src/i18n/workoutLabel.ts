/** Display label for a workout's name. Pure: safe under node --test. */
import { t } from './t.ts';

/** The stored default name ('Workout') or a blank is shown translated; any other name is user data. */
export function workoutLabel(name: string | null | undefined): string {
  return !name || name === 'Workout' ? t('workout.defaultName') : name;
}
