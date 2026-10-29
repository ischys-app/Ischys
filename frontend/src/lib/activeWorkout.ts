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
 *
 * One device-wide key, not one per profile: it names the profile the workout
 * belongs to as well, so launch can open that profile (#117). An entry from
 * before profiles is a bare id, and is the owner's.
 */
import * as SecureStore from 'expo-secure-store';

import { parseActiveWorkout } from '../domain/profiles';
import { activeProfile } from './activeProfile';

const KEY = 'ischys.activeWorkoutId';

export function rememberActiveWorkout(workoutId: string): void {
  try {
    SecureStore.setItem(KEY, JSON.stringify({ profileId: activeProfile().id, workoutId }));
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

/** The running workout and the profile it belongs to, whichever profile is active. */
export function recallActiveWorkoutEntry(): { profileId: string; workoutId: string } | null {
  try {
    return parseActiveWorkout(SecureStore.getItem(KEY));
  } catch {
    return null;
  }
}

/**
 * The workout to reopen on launch, or null. Only the active profile's: a
 * workout in another profile's file can't be opened from this one (launch
 * falls back to the owner when that profile's file fails to open).
 */
export function recallActiveWorkout(): string | null {
  const entry = recallActiveWorkoutEntry();
  return entry && entry.profileId === activeProfile().id ? entry.workoutId : null;
}
