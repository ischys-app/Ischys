/**
 * Export / import on-device — local equivalents of /export and /import?source=hevy.
 * Export is the user's backup (and the mechanism for the one-time server->local
 * migration). Import reads a Hevy CSV file and creates completed workouts.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { readAsStringAsync } from 'expo-file-system/legacy';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type { ImportResult, SetType } from '../api/types';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toHevyCsv, parseHevy, type ExportWorkout } from './hevyCsv';
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
  if (format === 'csv') return toHevyCsv(workouts);
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

async function findOrCreateExercise(name: string, cache: Map<string, string>): Promise<{ id: string; created: boolean }> {
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return { id: cached, created: false };
  const existing = await db.select().from(schema.exercises).where(eq(schema.exercises.name, name.trim()));
  if (existing[0]) {
    cache.set(key, existing[0].id);
    return { id: existing[0].id, created: false };
  }
  const id = newId();
  await db.insert(schema.exercises).values({
    id, userId: LOCAL_USER_ID, name: name.trim(), initials: initialsOf(name.trim()),
    kind: 'weighted', equipment: 'other', isCustom: 1, updatedAt: nowMs(),
  });
  cache.set(key, id);
  return { id, created: true };
}

export async function importFile(file: { uri: string; name: string; mimeType?: string }): Promise<ImportResult> {
  const text = await readAsStringAsync(file.uri);
  const parsed = parseHevy(text);

  const cache = new Map<string, string>();
  let workoutsCreated = 0;
  let exercisesCreated = 0;
  let setsImported = 0;
  let duplicatesSkipped = 0;
  const touched = new Set<string>();
  const warnings: string[] = [];

  // Idempotency: a completed workout is identified by (name, startedAt) — the key
  // parseHevy groups on. Re-importing the same export, or a later overlapping one,
  // must not duplicate history. Timeless rows (no parseable start) can't be keyed,
  // so they always import.
  const seen = new Set(
    (await db.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))).map(
      (w) => `${w.name}@@${w.startedAt}`,
    ),
  );

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
    await db.insert(schema.workouts).values({
      id: wid, userId: LOCAL_USER_ID, name: pw.title, status: 'completed',
      startedAt, endedAt: startedAt, durationSeconds: 0, updatedAt: nowMs(),
    });
    const allSets: SetLike[] = [];
    for (let p = 0; p < pw.exercises.length; p++) {
      const pe = pw.exercises[p];
      const { id: exId, created } = await findOrCreateExercise(pe.title, cache);
      if (created) exercisesCreated++;
      touched.add(exId);
      const weId = newId();
      await db.insert(schema.workoutExercises).values({
        id: weId, workoutId: wid, exerciseId: exId, position: p,
        restSeconds: 120, supersetGroup: pe.superset, updatedAt: nowMs(),
      });
      for (let j = 0; j < pe.sets.length; j++) {
        const ps = pe.sets[j];
        await db.insert(schema.workoutSets).values({
          id: newId(), workoutExerciseId: weId, position: j, type: ps.type,
          weight: ps.weight, reps: ps.reps, done: 1, completedAt: startedAt, updatedAt: nowMs(),
        });
        allSets.push({ type: ps.type as SetType, weight: ps.weight, reps: ps.reps, done: true });
        setsImported++;
      }
    }
    await db.update(schema.workouts).set({
      totalVolume: workoutVolume(allSets), totalSets: countWorkingSets(allSets), updatedAt: nowMs(),
    }).where(eq(schema.workouts.id, wid));
    workoutsCreated++;
  }

  for (const exId of touched) await recomputeForExercise(exId);

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
