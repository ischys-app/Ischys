/**
 * Routine builder on-device — ported from the original server implementation.
 * Touches the DB. No FK cascade, so child rows are removed explicitly. Sending
 * `exercises` on update replaces the whole list.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { atomically, db, type ProfileConnection } from '../db/client';
import * as schema from '../db/schema';
import type { RoutineExerciseIn, RoutineOut } from '../api/types';
import type { LoggedExercise } from '../domain/routineView';
import { exercisesToCopy } from '../domain/profiles';
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
  await atomically(async (tx) => {
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
  await atomically(async (tx) => {
    await tx.update(schema.routines).set(patch).where(eq(schema.routines.id, id));
    if (body.exercises !== undefined) {
      await clearExercises(tx, id);
      await insertExercises(tx, id, body.exercises);
    }
  });
  return getRoutine(id);
}

export async function deleteRoutine(id: string): Promise<void> {
  await atomically(async (tx) => {
    await clearExercises(tx, id);
    await tx.delete(schema.routines).where(eq(schema.routines.id, id));
  });
}

/** How many routines the current profile has (P4's START WITH row). */
export async function countRoutines(): Promise<number> {
  return (await db.select({ id: schema.routines.id }).from(schema.routines)).length;
}

/**
 * Every routine in the current profile, as stored rows, with what a copy into
 * another profile's file needs (#117, P4): their exercises and target sets,
 * and every exercise row they reference, with its secondary-muscle links.
 * Which of those exercises the new file lacks is decided by the writer.
 */
export type RoutineCopy = {
  routines: (typeof schema.routines.$inferSelect)[];
  routineExercises: (typeof schema.routineExercises.$inferSelect)[];
  routineSets: (typeof schema.routineSets.$inferSelect)[];
  exercises: (typeof schema.exercises.$inferSelect)[];
  secondaryMuscles: (typeof schema.exerciseSecondaryMuscles.$inferSelect)[];
};

export async function readRoutineCopy(): Promise<RoutineCopy> {
  const routines = await db.select().from(schema.routines);
  const routineExercises = await db.select().from(schema.routineExercises);
  const routineSets = await db.select().from(schema.routineSets);
  const exIds = Array.from(new Set(routineExercises.map((re) => re.exerciseId)));
  const exercises = exIds.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, exIds))
    : [];
  const secondaryMuscles = exIds.length
    ? await db
        .select()
        .from(schema.exerciseSecondaryMuscles)
        .where(inArray(schema.exerciseSecondaryMuscles.exerciseId, exIds))
    : [];
  return { routines, routineExercises, routineSets, exercises, secondaryMuscles };
}

const chunked = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Writes `copy` into another profile's file, unchanged, ids included, in one
 * synchronous transaction: all of it or none. The catalog is already there
 * (prepareConnection seeds it with the same ids), so only the exercises that
 * are custom, or that this file lacks, are added, with their muscle links.
 * The copies are independent of the originals from here on.
 */
export async function writeRoutineCopy(conn: ProfileConnection, copy: RoutineCopy): Promise<void> {
  const exIds = copy.exercises.map((e) => e.id);
  const present = exIds.length
    ? await conn.drizzle
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(inArray(schema.exercises.id, exIds))
    : [];
  const wanted = new Set(
    exercisesToCopy(
      copy.routineExercises.map((re) => re.exerciseId),
      copy.exercises,
      new Set(present.map((r) => r.id)),
    ),
  );
  const exercises = copy.exercises.filter((e) => wanted.has(e.id));
  const links = copy.secondaryMuscles.filter((l) => wanted.has(l.exerciseId));

  conn.drizzle.transaction((tx) => {
    for (const part of chunked(exercises, 50)) tx.insert(schema.exercises).values(part).run();
    for (const part of chunked(links, 200)) {
      tx.insert(schema.exerciseSecondaryMuscles).values(part).onConflictDoNothing().run();
    }
    for (const part of chunked(copy.routines, 100)) tx.insert(schema.routines).values(part).run();
    for (const part of chunked(copy.routineExercises, 100)) tx.insert(schema.routineExercises).values(part).run();
    for (const part of chunked(copy.routineSets, 100)) tx.insert(schema.routineSets).values(part).run();
  });
}
