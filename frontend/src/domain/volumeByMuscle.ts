/**
 * Volume-by-muscle breakdown for the Workout Summary. Counts working sets per
 * primary-muscle label (the caller resolves the label as muscle.group || name ||
 * "Other"), ordered by set count descending. Pure; node --test runs it.
 */
import { countWorkingSets, type SetLike } from './stats.ts';

export type MuscleVolume = { name: string; sets: number };

/** `items` is one entry per workout-exercise: its muscle label + its sets. */
export function volumeByMuscle(items: { muscleLabel: string; sets: SetLike[] }[]): MuscleVolume[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    counts.set(it.muscleLabel, (counts.get(it.muscleLabel) ?? 0) + countWorkingSets(it.sets));
  }
  // Stable sort by count desc — ties keep first-seen order, matching Python.
  return [...counts.entries()]
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets);
}
