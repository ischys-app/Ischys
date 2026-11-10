/**
 * Tiny in-memory cache for WorkoutSummaryOut payloads.
 *
 * The finish endpoint returns the summary once — there's no "get summary"
 * endpoint. We stash the response here so the Summary screen can pick it up
 * immediately after the finish handler navigates. Falls back to a degraded
 * `getWorkout` view when the entry is missing (deep link, refresh, etc.).
 */
import type { WorkoutSummaryOut } from '../api/types';
import { onLangChange } from '../i18n/current';
import { onProfileSwitch } from './activeProfile';

const cache = new Map<string, WorkoutSummaryOut>();

// The previous profile's workouts (#117).
onProfileSwitch(() => cache.clear());
// Names were localized when the workout finished (#136): the fallback view
// reads them again in the new language.
onLangChange(() => cache.clear());

export function saveSummary(workoutId: string, summary: WorkoutSummaryOut): void {
  cache.set(workoutId, summary);
}

export function getSummary(workoutId: string): WorkoutSummaryOut | null {
  return cache.get(workoutId) ?? null;
}
