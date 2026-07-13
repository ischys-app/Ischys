/**
 * Routine builder on-device — local equivalents of the /routines endpoints.
 * Touches the DB. No FK cascade, so child rows are removed explicitly. Sending
 * `exercises` on update replaces the whole list (matching the old server).
 */
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type { RoutineExerciseIn, RoutineOut } from '../api/types';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toRoutineExerciseOut, toRoutineOut, type ExerciseRow } from './map';
import { hydrateExercises } from './queries';
import { initialsOf } from './exercisesRepo';

async function loadRoutine(id: string): Promise<RoutineOut | null> {
  const r = (await db.select().from(schema.routines).where(eq(schema.routines.id, id)))[0];
  if (!r) return null;

  const res = await db
    .select()
    .from(schema.routineExercises)
    .where(eq(schema.routineExercises.routineId, id))
    .orderBy(asc(schema.routineExercises.position));
  const reIds = res.map((re) => re.id);
  const rsets = reIds.length
    ? await db.select().from(schema.routineSets).where(inArray(schema.routineSets.routineExerciseId, reIds))
    : [];
  const setsByRe = new Map<string, typeof rsets>();
  for (const s of rsets) {
    const list = setsByRe.get(s.routineExerciseId) ?? [];
    list.push(s);
    setsByRe.set(s.routineExerciseId, list);
  }

  const exRows = res.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, res.map((re) => re.exerciseId)))
    : [];
  const exById = await hydrateExercises(exRows as ExerciseRow[]);

  const exercises = res.map((re) =>
    toRoutineExerciseOut(
      re,
      exById.get(re.exerciseId)!,
      (setsByRe.get(re.id) ?? []).sort((a, b) => a.position - b.position),
    ),
  );
  return toRoutineOut(r, exercises);
}

export async function getRoutine(id: string): Promise<RoutineOut> {
  const r = await loadRoutine(id);
  if (!r) throw new Error('routine not found');
  return r;
}

/** db or a transaction handle — so the multi-row writers below stay atomic. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertExercises(
  exec: Executor,
  routineId: string,
  exercises: RoutineExerciseIn[],
): Promise<void> {
  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i];
    const reId = newId();
    await exec.insert(schema.routineExercises).values({
      id: reId,
      routineId,
      exerciseId: ex.exercise_id,
      position: i,
      restSeconds: ex.rest_seconds,
      note: ex.note ?? null,
      updatedAt: nowMs(),
    });
    for (let j = 0; j < ex.sets.length; j++) {
      await exec.insert(schema.routineSets).values({
        id: newId(),
        routineExerciseId: reId,
        position: j,
        type: ex.sets[j].type,
        targetWeight: ex.sets[j].target_weight ?? null,
        targetReps: ex.sets[j].target_reps ?? null,
        updatedAt: nowMs(),
      });
    }
  }
}

async function clearExercises(exec: Executor, routineId: string): Promise<void> {
  const res = await exec.select().from(schema.routineExercises).where(eq(schema.routineExercises.routineId, routineId));
  const reIds = res.map((re) => re.id);
  if (reIds.length) await exec.delete(schema.routineSets).where(inArray(schema.routineSets.routineExerciseId, reIds));
  await exec.delete(schema.routineExercises).where(eq(schema.routineExercises.routineId, routineId));
}

export async function createRoutine(body: {
  name: string;
  exercises: RoutineExerciseIn[];
}): Promise<RoutineOut> {
  const id = newId();
  const lastPos = (await db.select().from(schema.routines)).reduce((m, r) => Math.max(m, r.position + 1), 0);
  await db.transaction(async (tx) => {
    await tx.insert(schema.routines).values({
      id,
      userId: LOCAL_USER_ID,
      name: body.name,
      initials: initialsOf(body.name),
      position: lastPos,
      updatedAt: nowMs(),
    });
    await insertExercises(tx, id, body.exercises);
  });
  return getRoutine(id);
}

export async function updateRoutine(
  id: string,
  body: { name?: string; exercises?: RoutineExerciseIn[] },
): Promise<RoutineOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
  if (body.name !== undefined) {
    patch.name = body.name;
    patch.initials = initialsOf(body.name);
  }
  // Atomic: replacing the exercise list must never leave the routine half-cleared.
  await db.transaction(async (tx) => {
    await tx.update(schema.routines).set(patch).where(eq(schema.routines.id, id));
    if (body.exercises !== undefined) {
      await clearExercises(tx, id);
      await insertExercises(tx, id, body.exercises);
    }
  });
  return getRoutine(id);
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await clearExercises(tx, id);
    await tx.delete(schema.routines).where(eq(schema.routines.id, id));
  });
}
