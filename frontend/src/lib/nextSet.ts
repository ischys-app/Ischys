/**
 * "Which set comes next?" — the one look-ahead the phone, the Lock Screen card,
 * the Watch and the end-of-rest notification all have to agree on.
 *
 * It scans the whole workout, not one exercise: the set after an exercise's last
 * one is the *next exercise's* first set. Each surface used to answer this its
 * own way and they disagreed — the Watch clamped to the current exercise's last
 * set (#20) and the rest notification named the exercise you had just finished
 * (#19).
 *
 * `treatAsDone` exists because the answer is usually needed at the instant a set
 * is completed, before `setExercises` has re-rendered: pass the id of the set
 * being completed and it is skipped as if already done.
 *
 * Inside a superset the partners alternate, round by round (#53): after the
 * first partner's set comes the second partner's, not the first one's next.
 * `restAfterSet` (domain/supersets.ts) decides the rest by the same rounds.
 *
 * Pure, so `node --test` can run it. See nextSet.test.ts.
 */
import { roundOfSet } from '../domain/supersets.ts';

/** `type` is the set type; without one a set counts as a working set. */
type SetLike = { id: string; done: boolean; type?: string };
/** `supersetGroup` is shared by paired exercises; absent or null when solo. */
type ExerciseLike = { sets: readonly SetLike[]; supersetGroup?: number | null };

export type LocatedSet<E> = {
  exercise: E;
  /** Index into `exercises`. */
  exerciseIndex: number;
  /** Index into `exercise.sets`. */
  setIndex: number;
};

/**
 * The first set that is neither `done` nor `treatAsDone`, scanning exercises in
 * order. A superset is taken whole where its first partner is: its warm-ups,
 * then round 1 across the partners, then round 2, and so on. `null` when the
 * workout has nothing left to do.
 */
export function locateNextSet<E extends ExerciseLike>(
  exercises: readonly E[],
  treatAsDone?: string,
): LocatedSet<E> | null {
  const open = (s: SetLike) => !s.done && s.id !== treatAsDone;
  const seenGroups = new Set<number>();
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
    const exercise = exercises[exerciseIndex];
    const group = exercise.supersetGroup;
    if (group == null) {
      const setIndex = exercise.sets.findIndex(open);
      if (setIndex !== -1) return { exercise, exerciseIndex, setIndex };
      continue;
    }
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    const found = nextInSuperset(exercises, group, open);
    if (found) return found;
  }
  return null;
}

/** The earliest open set of a superset: lowest round first (warm-ups as round 0), then list order. */
function nextInSuperset<E extends ExerciseLike>(
  exercises: readonly E[],
  group: number,
  open: (s: SetLike) => boolean,
): LocatedSet<E> | null {
  let best: (LocatedSet<E> & { round: number }) | null = null;
  exercises.forEach((exercise, exerciseIndex) => {
    if (exercise.supersetGroup !== group) return;
    const typed = exercise.sets.map((s) => ({ id: s.id, done: s.done, type: s.type ?? 'normal' }));
    const setIndex = exercise.sets.findIndex(open);
    if (setIndex === -1) return;
    const round = roundOfSet(typed, exercise.sets[setIndex].id) ?? 0;
    // Ties keep the earlier partner: rounds go down the list.
    if (!best || round < best.round) best = { exercise, exerciseIndex, setIndex, round };
  });
  if (!best) return null;
  const { exercise, exerciseIndex, setIndex } = best;
  return { exercise, exerciseIndex, setIndex };
}
