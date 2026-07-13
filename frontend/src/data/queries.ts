/**
 * Shared SQLite loaders for the local repo. These touch the DB (drizzle/expo),
 * so they are never imported by node-tested code. They batch the catalog lookups
 * (categories/muscles are tiny) and assemble the nested DTOs via ./map.
 */
import { and, asc, eq, inArray } from 'drizzle-orm';

import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type { ExerciseOut, WorkoutOut } from '../api/types';
import {
  toExerciseOut,
  toWorkoutExerciseOut,
  toWorkoutOut,
  type ExerciseRow,
  type MuscleRow,
  type WorkoutExerciseRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from './map';

/** Hydrate exercise rows into full ExerciseOut (category + primary/secondary muscles). */
export async function hydrateExercises(rows: ExerciseRow[]): Promise<Map<string, ExerciseOut>> {
  const out = new Map<string, ExerciseOut>();
  if (rows.length === 0) return out;

  const cats = await db.select().from(schema.categories);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const muscleRows = await db.select().from(schema.muscles);
  const muscleById = new Map(muscleRows.map((m) => [m.id, m as MuscleRow]));

  const ids = rows.map((r) => r.id);
  const links = await db
    .select()
    .from(schema.exerciseSecondaryMuscles)
    .where(inArray(schema.exerciseSecondaryMuscles.exerciseId, ids));
  const secondaryByExercise = new Map<string, MuscleRow[]>();
  for (const link of links) {
    const m = muscleById.get(link.muscleId);
    if (!m) continue;
    const list = secondaryByExercise.get(link.exerciseId) ?? [];
    list.push(m);
    secondaryByExercise.set(link.exerciseId, list);
  }

  for (const ex of rows) {
    const category = ex.categoryId ? catById.get(ex.categoryId) ?? null : null;
    const primary = ex.primaryMuscleId ? muscleById.get(ex.primaryMuscleId) ?? null : null;
    out.set(ex.id, toExerciseOut(ex, category, primary, secondaryByExercise.get(ex.id) ?? []));
  }
  return out;
}

/** One exercise → ExerciseOut, or null if missing. */
export async function loadExercise(id: string): Promise<ExerciseOut | null> {
  const rows = await db.select().from(schema.exercises).where(inArray(schema.exercises.id, [id]));
  if (rows.length === 0) return null;
  return (await hydrateExercises(rows as ExerciseRow[])).get(id) ?? null;
}

/** Primary-muscle label for volume/tags: group || name || "Other". */
export function muscleLabel(primary: MuscleRow | null | undefined): string {
  if (!primary) return 'Other';
  return primary.group || primary.name;
}

/** All completed sessions of one exercise (sets grouped per workout), newest first. */
export async function completedSessionsFor(
  exerciseId: string,
  exec: Executor = db,
): Promise<{ workoutId: string; startedAt: number; sets: WorkoutSetRow[] }[]> {
  const rows = await exec
    .select({ workoutId: schema.workouts.id, startedAt: schema.workouts.startedAt, set: schema.workoutSets })
    .from(schema.workouts)
    .innerJoin(schema.workoutExercises, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .innerJoin(schema.workoutSets, eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id))
    .where(and(eq(schema.workoutExercises.exerciseId, exerciseId), eq(schema.workouts.status, 'completed')));

  const byWorkout = new Map<string, { workoutId: string; startedAt: number; sets: WorkoutSetRow[] }>();
  for (const r of rows) {
    let s = byWorkout.get(r.workoutId);
    if (!s) {
      s = { workoutId: r.workoutId, startedAt: r.startedAt, sets: [] };
      byWorkout.set(r.workoutId, s);
    }
    s.sets.push(r.set as WorkoutSetRow);
  }
  return [...byWorkout.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** Assemble one workout (with ordered exercises + sets) into a WorkoutOut, or null. */
export async function loadWorkout(id: string): Promise<WorkoutOut | null> {
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, id)))[0];
  if (!w) return null;

  const wes = await db
    .select()
    .from(schema.workoutExercises)
    .where(eq(schema.workoutExercises.workoutId, id))
    .orderBy(asc(schema.workoutExercises.position));
  const weIds = wes.map((we) => we.id);

  const sets = weIds.length
    ? await db.select().from(schema.workoutSets).where(inArray(schema.workoutSets.workoutExerciseId, weIds))
    : [];
  const setsByWe = new Map<string, WorkoutSetRow[]>();
  for (const s of sets as WorkoutSetRow[]) {
    const list = setsByWe.get(s.workoutExerciseId) ?? [];
    list.push(s);
    setsByWe.set(s.workoutExerciseId, list);
  }

  const exRows = wes.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, wes.map((we) => we.exerciseId)))
    : [];
  const exById = await hydrateExercises(exRows as ExerciseRow[]);

  const exercises = wes.flatMap((we) => {
    const ex = exById.get(we.exerciseId);
    // The catalog row can be missing — e.g. a custom lift deleted after the
    // workout referenced it. Skip that exercise rather than crash the whole load.
    if (!ex) return [];
    return [
      toWorkoutExerciseOut(
        we as WorkoutExerciseRow,
        ex,
        (setsByWe.get(we.id) ?? []).sort((a, b) => a.position - b.position),
      ),
    ];
  });
  return toWorkoutOut(w as WorkoutRow, exercises);
}

/** Batch the primary-muscle tags (group||name, deduped, in exercise order) per workout. */
export async function muscleTagsByWorkout(workoutIds: string[]): Promise<Map<string, string[]>> {
  const tags = new Map<string, string[]>();
  if (workoutIds.length === 0) return tags;

  const wes = await db
    .select()
    .from(schema.workoutExercises)
    .where(inArray(schema.workoutExercises.workoutId, workoutIds))
    .orderBy(asc(schema.workoutExercises.position));
  const exRows = wes.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, wes.map((we) => we.exerciseId)))
    : [];
  const muscleRows = await db.select().from(schema.muscles);
  const muscleById = new Map(muscleRows.map((m) => [m.id, m as MuscleRow]));
  const primaryByEx = new Map(exRows.map((e) => [e.id, e.primaryMuscleId ? muscleById.get(e.primaryMuscleId) ?? null : null]));

  for (const we of wes) {
    const label = muscleLabel(primaryByEx.get(we.exerciseId) ?? null);
    const list = tags.get(we.workoutId) ?? [];
    if (!list.includes(label)) list.push(label);
    tags.set(we.workoutId, list);
  }
  return tags;
}
