/**
 * Routine data-access — delegates to the local SQLite repo (src/data). Screens
 * import the same names; nothing hits the network.
 */
import type { RoutineExerciseIn, RoutineOut } from './types';
import { createRoutine, getRoutine } from '../data/routinesRepo';

export { getRoutine, createRoutine, updateRoutine, deleteRoutine } from '../data/routinesRepo';

/**
 * Duplicate a routine: load the source, strip ids, then create a copy named
 * "{original} (copy)" with the same exercises + target sets.
 */
export async function duplicateRoutine(id: string): Promise<RoutineOut> {
  const existing = await getRoutine(id);
  const exercises: RoutineExerciseIn[] = existing.exercises.map((ex) => ({
    exercise_id: ex.exercise.id,
    rest_seconds: ex.rest_seconds,
    note: ex.note ?? null,
    sets: ex.sets.map((s) => ({
      type: s.type,
      target_weight: s.target_weight ?? null,
      target_reps: s.target_reps ?? null,
    })),
  }));
  return createRoutine({ name: `${existing.name} (copy)`, exercises });
}
