/**
 * Replacing an exercise, as pure decisions.
 *
 * There is no single "swap" operation for the exercise a workout-exercise row
 * points at, so a replace is add + remove + reorder. `addWorkoutExercise`
 * appends, which loses the position — the reorder is what puts the newcomer
 * back where the old one stood, and is the part that fails silently if wrong.
 *
 * Pure — no imports, so `node --test` can run it. See replaceExercise.test.ts.
 */

export type ReplaceableExercise = {
  id: string;
  exerciseCatalogId?: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
  rest: number;
  note: string;
  sets: unknown[];
};

export type ChosenExercise = {
  id: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
};

/**
 * The id order to send after the newcomer has been appended: `newId` takes
 * `targetId`'s slot. Returns the list unchanged when `targetId` is absent, so a
 * stale replace cannot scramble the workout.
 */
export function replaceOrder(
  ids: readonly string[],
  targetId: string,
  newId: string,
): string[] {
  return ids.map((id) => (id === targetId ? newId : id));
}

/**
 * The replaced row. Rest carries over — it is a property of the slot, not the
 * exercise. Sets and note do not: they described a different movement.
 */
export function swapExercise<S>(
  old: ReplaceableExercise,
  chosen: ChosenExercise,
  freshSet: S,
): ReplaceableExercise {
  return {
    ...old,
    exerciseCatalogId: chosen.id,
    name: chosen.name,
    initials: chosen.initials,
    equipment: chosen.equipment,
    kind: chosen.kind,
    note: '',
    sets: [freshSet],
  };
}
