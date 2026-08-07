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
 * Pure — no imports, so `node --test` can run it. See nextSet.test.ts.
 */

type SetLike = { id: string; done: boolean };
type ExerciseLike = { sets: readonly SetLike[] };

export type LocatedSet<E> = {
  exercise: E;
  /** Index into `exercises`. */
  exerciseIndex: number;
  /** Index into `exercise.sets`. */
  setIndex: number;
};

/**
 * The first set that is neither `done` nor `treatAsDone`, scanning exercises in
 * order. `null` when the workout has nothing left to do.
 */
export function locateNextSet<E extends ExerciseLike>(
  exercises: readonly E[],
  treatAsDone?: string,
): LocatedSet<E> | null {
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex++) {
    const exercise = exercises[exerciseIndex];
    const setIndex = exercise.sets.findIndex((s) => !s.done && s.id !== treatAsDone);
    if (setIndex !== -1) return { exercise, exerciseIndex, setIndex };
  }
  return null;
}
