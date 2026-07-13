/**
 * Profile aggregate stats — a port of `_stats` (backend/app/api/profile.py),
 * computed from the user's completed workouts. Local time is authoritative (the
 * user's perceived day/year), consistent with weeklyBars. Pure; node --test runs it.
 */
import { weekStreak } from './streak.ts';

export type ProfileStatsResult = {
  workouts: number;
  thisYear: number;
  /** kg — sum of denormalized per-workout total_volume. */
  volumeLifted: number;
  /** weeks */
  currentStreak: number;
};

/** `completed` = the user's completed workouts (startedAt epoch ms, totalVolume kg). */
export function profileStats(
  completed: { startedAt: number; totalVolume: number }[],
  now: Date,
): ProfileStatsResult {
  const year = now.getFullYear();
  const thisYear = completed.filter((w) => new Date(w.startedAt).getFullYear() === year).length;
  const volumeLifted = completed.reduce((sum, w) => sum + w.totalVolume, 0);
  const dates = completed.map((w) => new Date(w.startedAt));
  return {
    workouts: completed.length,
    thisYear,
    volumeLifted,
    currentStreak: weekStreak(dates, now),
  };
}
