/**
 * Export / import on-device. Export is the user's backup; import reads a workout
 * CSV file and creates completed workouts locally.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { readAsStringAsync } from 'expo-file-system/legacy';

import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type { ImportResult, SetType } from '../api/types';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toWorkoutCsv, parseWorkoutCsv, type ExportWorkout } from './workoutCsv';
import { parseServerDate } from '../lib/serverTime';
import { initialsOf } from './exercisesRepo';
import { recomputeForExercise } from './recordStore';

type FullSet = { position: number; type: string; weight: number | null; reps: number | null; done: boolean; isPr: boolean };
type FullExercise = { name: string; note: string | null; supersetGroup: number | null; sets: FullSet[] };
type FullWorkout = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  notes: string | null;
  durationSeconds: number;
  totalVolume: number;
  totalSets: number;
  prCount: number;
  exercises: FullExercise[];
};

async function gatherCompleted(): Promise<FullWorkout[]> {
  const workouts = await db.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed')).orderBy(asc(schema.workouts.startedAt));
  const out: FullWorkout[] = [];
  for (const w of workouts) {
    const wes = await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, w.id)).orderBy(asc(schema.workoutExercises.position));
    const exRows = wes.length ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, wes.map((we) => we.exerciseId))) : [];
    const nameById = new Map(exRows.map((e) => [e.id, e.name]));
    const exercises = [];
    for (const we of wes) {
      const sets = await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.workoutExerciseId, we.id)).orderBy(asc(schema.workoutSets.position));
      exercises.push({
        name: nameById.get(we.exerciseId) ?? '',
        note: we.note,
        supersetGroup: we.supersetGroup,
        sets: sets.map((s) => ({ position: s.position, type: s.type, weight: s.weight, reps: s.reps, done: s.done !== 0, isPr: s.isPr !== 0 })),
      });
    }
    out.push({
      id: w.id, name: w.name, startedAt: w.startedAt, endedAt: w.endedAt, notes: null,
      durationSeconds: w.durationSeconds, totalVolume: w.totalVolume, totalSets: w.totalSets, prCount: w.prCount,
      exercises,
    });
  }
  return out;
}

export async function exportData(format: 'json' | 'csv'): Promise<string> {
  const workouts = await gatherCompleted();
  if (format === 'csv') return toWorkoutCsv(workouts);
  return JSON.stringify({
    workouts: workouts.map((w) => ({
      id: w.id, name: w.name,
      started_at: new Date(w.startedAt).toISOString(),
      ended_at: w.endedAt === null ? null : new Date(w.endedAt).toISOString(),
      duration_seconds: w.durationSeconds, total_volume: w.totalVolume, total_sets: w.totalSets, pr_count: w.prCount,
      exercises: w.exercises.map((ex) => ({
        name: ex.name, note: ex.note, superset_group: ex.supersetGroup,
        sets: ex.sets.map((s) => ({ type: s.type, weight_kg: s.weight, reps: s.reps, done: s.done, is_pr: s.isPr })),
      })),
    })),
  });
}

async function findOrCreateExercise(
  name: string,
  cache: Map<string, string>,
  exec: Executor = db,
): Promise<{ id: string; created: boolean }> {
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return { id: cached, created: false };
  const existing = await exec.select().from(schema.exercises).where(eq(schema.exercises.name, name.trim()));
  if (existing[0]) {
    cache.set(key, existing[0].id);
    return { id: existing[0].id, created: false };
  }
  const id = newId();
  await exec.insert(schema.exercises).values({
    id, userId: LOCAL_USER_ID, name: name.trim(), initials: initialsOf(name.trim()),
    kind: 'weighted', equipment: 'other', isCustom: 1, updatedAt: nowMs(),
  });
  cache.set(key, id);
  return { id, created: true };
}

/**
 * Import a file — an Ischys JSON backup (full fidelity: notes, supersets, PR
 * flags) or a workout CSV. Sniffs the format so the caller doesn't have to.
 */
export async function importFile(file: { uri: string; name: string; mimeType?: string }): Promise<ImportResult> {
  const text = await readAsStringAsync(file.uri);
  const looksJson =
    text.trimStart().startsWith('{') ||
    /\.json$/i.test(file.name) ||
    (file.mimeType ?? '').includes('json');
  return looksJson ? importJsonBackup(text) : importWorkoutCsv(text);
}

async function importWorkoutCsv(text: string): Promise<ImportResult> {
  const parsed = parseWorkoutCsv(text);

  const cache = new Map<string, string>();
  let workoutsCreated = 0;
  let exercisesCreated = 0;
  let setsImported = 0;
  let duplicatesSkipped = 0;
  const touched = new Set<string>();
  const warnings: string[] = [];

  // Idempotency: a completed workout is identified by (name, startedAt) — the key
  // parseWorkoutCsv groups on. Re-importing the same export, or a later overlapping one,
  // must not duplicate history. Timeless rows (no parseable start) can't be keyed,
  // so they always import.
  const seen = new Set(
    (await db.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))).map(
      (w) => `${w.name}@@${w.startedAt}`,
    ),
  );

  // All-or-nothing: an interrupted import must not leave half-written workouts
  // (which the idempotency check above would then permanently skip on retry).
  await db.transaction(async (tx) => {
    for (const pw of parsed.workouts) {
      const startedAt = pw.startedAt ?? nowMs();
      if (pw.startedAt !== null) {
        const key = `${pw.title}@@${pw.startedAt}`;
        if (seen.has(key)) {
          duplicatesSkipped++;
          continue;
        }
        seen.add(key);
      }
      const wid = newId();
      await tx.insert(schema.workouts).values({
        id: wid, userId: LOCAL_USER_ID, name: pw.title, status: 'completed',
        startedAt, endedAt: startedAt, durationSeconds: 0, updatedAt: nowMs(),
      });
      const allSets: SetLike[] = [];
      for (let p = 0; p < pw.exercises.length; p++) {
        const pe = pw.exercises[p];
        const { id: exId, created } = await findOrCreateExercise(pe.title, cache, tx);
        if (created) exercisesCreated++;
        touched.add(exId);
        const weId = newId();
        await tx.insert(schema.workoutExercises).values({
          id: weId, workoutId: wid, exerciseId: exId, position: p,
          restSeconds: 120, supersetGroup: pe.superset, updatedAt: nowMs(),
        });
        for (let j = 0; j < pe.sets.length; j++) {
          const ps = pe.sets[j];
          await tx.insert(schema.workoutSets).values({
            id: newId(), workoutExerciseId: weId, position: j, type: ps.type,
            weight: ps.weight, reps: ps.reps, done: 1, completedAt: startedAt, updatedAt: nowMs(),
          });
          allSets.push({ type: ps.type as SetType, weight: ps.weight, reps: ps.reps, done: true });
          setsImported++;
        }
      }
      await tx.update(schema.workouts).set({
        totalVolume: workoutVolume(allSets), totalSets: countWorkingSets(allSets), updatedAt: nowMs(),
      }).where(eq(schema.workouts.id, wid));
      workoutsCreated++;
    }

    for (const exId of touched) await recomputeForExercise(exId, tx);
  });

  if (duplicatesSkipped > 0) {
    warnings.push(`${duplicatesSkipped} workout${duplicatesSkipped === 1 ? '' : 's'} already imported, skipped`);
  }

  return {
    workouts_created: workoutsCreated,
    exercises_created: exercisesCreated,
    sets_imported: setsImported,
    rows_skipped: parsed.rowsSkipped,
    warnings,
  };
}

type JsonSet = { type?: string; weight_kg?: number | null; reps?: number | null; done?: boolean; is_pr?: boolean };
type JsonExercise = { name?: string; note?: string | null; superset_group?: number | null; sets?: JsonSet[] };
type JsonWorkout = {
  name?: string;
  started_at?: string;
  ended_at?: string | null;
  duration_seconds?: number;
  exercises?: JsonExercise[];
};

/**
 * Restore an Ischys JSON backup (the shape `exportData('json')` produces). Unlike
 * the CSV path this is loss-free — it keeps exercise notes, superset groups, PR
 * flags, and each workout's exact structure. Idempotent by (name, started_at).
 */
async function importJsonBackup(text: string): Promise<ImportResult> {
  let data: { workouts?: JsonWorkout[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid Ischys JSON export');
  }
  const workoutsIn = Array.isArray(data?.workouts) ? data.workouts : [];

  const cache = new Map<string, string>();
  let workoutsCreated = 0;
  let exercisesCreated = 0;
  let setsImported = 0;
  let duplicatesSkipped = 0;
  let workoutsSkipped = 0;
  const touched = new Set<string>();
  const warnings: string[] = [];

  const seen = new Set(
    (await db.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))).map(
      (w) => `${w.name}@@${w.startedAt}`,
    ),
  );

  await db.transaction(async (tx) => {
    for (const w of workoutsIn) {
      const name = (w.name ?? '').trim() || 'Workout';
      const startedAt = parseServerDate(w.started_at ?? '');
      if (Number.isNaN(startedAt)) {
        workoutsSkipped++;
        continue;
      }
      const key = `${name}@@${startedAt}`;
      if (seen.has(key)) {
        duplicatesSkipped++;
        continue;
      }
      seen.add(key);

      const endedRaw = w.ended_at ? parseServerDate(w.ended_at) : NaN;
      const endedAt = Number.isNaN(endedRaw) ? startedAt : endedRaw;
      const wid = newId();
      await tx.insert(schema.workouts).values({
        id: wid,
        userId: LOCAL_USER_ID,
        name,
        status: 'completed',
        startedAt,
        endedAt,
        durationSeconds: w.duration_seconds ?? Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
        updatedAt: nowMs(),
      });

      const allSets: SetLike[] = [];
      const exs = Array.isArray(w.exercises) ? w.exercises : [];
      for (let p = 0; p < exs.length; p++) {
        const pe = exs[p];
        const exName = (pe.name ?? '').trim();
        if (!exName) continue;
        const { id: exId, created } = await findOrCreateExercise(exName, cache, tx);
        if (created) exercisesCreated++;
        touched.add(exId);
        const weId = newId();
        await tx.insert(schema.workoutExercises).values({
          id: weId,
          workoutId: wid,
          exerciseId: exId,
          position: p,
          restSeconds: 120,
          note: pe.note ?? null,
          supersetGroup: pe.superset_group ?? null,
          updatedAt: nowMs(),
        });
        const psets = Array.isArray(pe.sets) ? pe.sets : [];
        for (let j = 0; j < psets.length; j++) {
          const ps = psets[j];
          const done = ps.done !== false; // exported workouts are completed
          const type = (ps.type as SetType) ?? 'normal';
          const weight = ps.weight_kg ?? null;
          const reps = ps.reps ?? null;
          await tx.insert(schema.workoutSets).values({
            id: newId(),
            workoutExerciseId: weId,
            position: j,
            type,
            weight,
            reps,
            done: done ? 1 : 0,
            isPr: ps.is_pr ? 1 : 0,
            completedAt: done ? startedAt : null,
            updatedAt: nowMs(),
          });
          allSets.push({ type, weight, reps, done });
          setsImported++;
        }
      }
      await tx
        .update(schema.workouts)
        .set({ totalVolume: workoutVolume(allSets), totalSets: countWorkingSets(allSets), updatedAt: nowMs() })
        .where(eq(schema.workouts.id, wid));
      workoutsCreated++;
    }

    for (const exId of touched) await recomputeForExercise(exId, tx);
  });

  if (duplicatesSkipped > 0) {
    warnings.push(`${duplicatesSkipped} workout${duplicatesSkipped === 1 ? '' : 's'} already imported, skipped`);
  }
  if (workoutsSkipped > 0) {
    warnings.push(`${workoutsSkipped} workout${workoutsSkipped === 1 ? '' : 's'} skipped (no valid date)`);
  }

  return {
    workouts_created: workoutsCreated,
    exercises_created: exercisesCreated,
    sets_imported: setsImported,
    rows_skipped: 0,
    warnings,
  };
}
