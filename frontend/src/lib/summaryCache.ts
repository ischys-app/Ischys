/**
 * Tiny in-memory cache for WorkoutSummaryOut payloads.
 *
 * The finish endpoint returns the summary once — there's no "get summary"
 * endpoint. We stash the response here so the Summary screen can pick it up
 * immediately after the finish handler navigates. Falls back to a degraded
 * `getWorkout` view when the entry is missing (deep link, refresh, etc.).
 */
import type { WorkoutSummaryOut } from '../api/types';

const cache = new Map<string, WorkoutSummaryOut>();

export function saveSummary(workoutId: string, summary: WorkoutSummaryOut): void {
  cache.set(workoutId, summary);
}

export function getSummary(workoutId: string): WorkoutSummaryOut | null {
  return cache.get(workoutId) ?? null;
}
