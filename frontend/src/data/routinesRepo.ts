/**
 * Routine builder on-device — ported from the original server implementation.
 * Touches the DB. No FK cascade, so child rows are removed explicitly. Sending
 * `exercises` on update replaces the whole list.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type { RoutineExerciseIn, RoutineOut } from '../api/types';
import type { LoggedExercise } from '../domain/routineView';
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

  const exercises = res.flatMap((re) => {
    const ex = exById.get(re.exerciseId);
    // Skip an entry whose catalog row is gone rather than crash the whole routine.
    if (!ex) return [];
    return [toRoutineExerciseOut(re, ex, (setsByRe.get(re.id) ?? []).sort((a, b) => a.position - b.position))];
  });
  return toRoutineOut(r, exercises);
}

export async function getRoutine(id: string): Promise<RoutineOut> {
  const r = await loadRoutine(id);
  if (!r) throw new Error('routine not found');
  return r;
}

/** How a routine has gone before, for the read-only Routine View (#85). */
export type RoutineHistory = {
  /** Lengths of the most recent completed runs, newest first, in seconds. */
  recentDurations: number[];
  /** The most recent completed run, or null when the routine was never done. */
  last: {
    /** Epoch ms. */
    startedAt: number;
    durationSeconds: number;
    exercises: LoggedExercise[];
  } | null;
};

/** Runs that feed the duration estimate. */
const HISTORY_RUNS = 3;

/**
 * The last few completed workouts started from this routine: their lengths, and
 * the newest one's sets in the order they were performed.
 */
export async function getRoutineHistory(id: string): Promise<RoutineHistory> {
  const runs = await db
    .select({
      id: schema.workouts.id,
      startedAt: schema.workouts.startedAt,
      durationSeconds: schema.workouts.durationSeconds,
    })
    .from(schema.workouts)
    .where(and(eq(schema.workouts.routineId, id), eq(schema.workouts.status, 'completed')))
    .orderBy(desc(schema.workouts.startedAt))
    .limit(HISTORY_RUNS);
  const newest = runs[0];
  if (!newest) return { recentDurations: [], last: null };

  const wes = await db
    .select()
    .from(schema.workoutExercises)
    .where(eq(schema.workoutExercises.workoutId, newest.id))
    .orderBy(asc(schema.workoutExercises.position));
  const sets = wes.length
    ? await db
        .select()
        .from(schema.workoutSets)
        .where(inArray(schema.workoutSets.workoutExerciseId, wes.map((we) => we.id)))
    : [];
  const setsByWe = new Map<string, typeof sets>();
  for (const s of sets) {
    const list = setsByWe.get(s.workoutExerciseId) ?? [];
    list.push(s);
    setsByWe.set(s.workoutExerciseId, list);
  }

  return {
    recentDurations: runs.map((r) => r.durationSeconds),
    last: {
      startedAt: newest.startedAt,
      durationSeconds: newest.durationSeconds,
      exercises: wes.map((we) => ({
        exerciseId: we.exerciseId,
        sets: (setsByWe.get(we.id) ?? [])
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ weight: s.weight, reps: s.reps, done: s.done !== 0 })),
      })),
    },
  };
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
      supersetGroup: ex.superset_group ?? null,
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
