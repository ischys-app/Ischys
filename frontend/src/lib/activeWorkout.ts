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

// --- In-flight rest timer, so a mid-rest app kill doesn't lose the countdown ---
const REST_KEY = 'ischys.activeRest';

export function rememberRest(workoutId: string, endsAt: number, total: number): void {
  try {
    SecureStore.setItem(REST_KEY, JSON.stringify({ workoutId, endsAt, total }));
  } catch {
    // storage unavailable — the rest bar just won't survive a kill
  }
}

export function forgetRest(): void {
  try {
    SecureStore.deleteItemAsync(REST_KEY).catch(() => {});
  } catch {
    // as above
  }
}

/** Restore in-flight rest for this workout, if it belongs to it and hasn't ended. */
export function recallRest(workoutId: string): { endsAt: number; total: number } | null {
  try {
    const raw = SecureStore.getItem(REST_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as { workoutId?: string; endsAt?: number; total?: number };
    if (r.workoutId !== workoutId || typeof r.endsAt !== 'number' || r.endsAt <= Date.now()) return null;
    return { endsAt: r.endsAt, total: typeof r.total === 'number' ? r.total : 0 };
  } catch {
    return null;
  }
}
