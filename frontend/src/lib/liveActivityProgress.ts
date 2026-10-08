/**
 * How far through the workout you are, for the Android notification's bar.
 *
 * Counted over every set, warmups included: the bar answers "how much is left
 * to do", and a warmup still has to be done. It is kept apart from
 * `buildLiveActivityState` because it is not something the iOS card shows.
 *
 * Pure — no imports, so `node --test` can run it. See liveActivityProgress.test.ts.
 */

type SetLike = { done: boolean };
type ExerciseLike = { sets: readonly SetLike[] };

export type SetProgress = { setsDone: number; setsTotal: number };

export function setProgress(exercises: readonly ExerciseLike[]): SetProgress {
  let setsDone = 0;
  let setsTotal = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      setsTotal += 1;
      if (set.done) setsDone += 1;
    }
  }
  return { setsDone, setsTotal };
}
