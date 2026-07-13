/**
 * Remembers that the user is mid-workout, so a relaunch returns them to it.
 *
 * React Native always cold-starts at the root route. That is fine when the user
 * chose to leave, but iOS can launch the app in the background to run a Live
 * Activity intent and then terminate it — through no action of theirs. Without
 * this, reopening drops them on Home with a "resume" bar for a workout they
 * never left.
 *
 * Cleared when the user *does* choose to leave: back, finish, or discard.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'ischys.activeWorkoutId';

export function rememberActiveWorkout(workoutId: string): void {
  try {
    SecureStore.setItem(KEY, workoutId);
  } catch {
    // Storage unavailable — we just lose the restore, not the workout.
  }
}

export function forgetActiveWorkout(): void {
  try {
    SecureStore.deleteItemAsync(KEY).catch(() => {});
  } catch {
    // as above
  }
}

/** The workout to reopen on launch, or null. */
export function recallActiveWorkout(): string | null {
  try {
    return SecureStore.getItem(KEY);
  } catch {
    return null;
  }
}
