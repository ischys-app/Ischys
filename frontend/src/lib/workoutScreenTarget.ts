/**
 * Where a request to open the running-workout screen should end up.
 *
 * That screen is for a workout in progress, and it is reached by id: from a
 * link, and at launch from the id remembered when the app was last closed
 * (activeWorkout.ts). Either can name a workout that is no longer running, or
 * no longer there at all — the Keychain outlives a reinstall and a restored
 * database. A workout that failed to load used to be replaced by a made-up one
 * with a running clock, whose sets went nowhere.
 *
 * Pure, so `node --test` covers it. See workoutScreenTarget.test.ts.
 */

export type WorkoutScreenTarget =
  /** In progress: show it. */
  | 'workout'
  /** Finished: its summary is the screen for it. */
  | 'summary'
  /** Discarded, or not there: nothing to show. */
  | 'leave';

/** `status` is the stored workout's, or null when no workout has that id. */
export function workoutScreenTarget(status: string | null): WorkoutScreenTarget {
  if (status === 'active') return 'workout';
  if (status === 'completed') return 'summary';
  return 'leave';
}
