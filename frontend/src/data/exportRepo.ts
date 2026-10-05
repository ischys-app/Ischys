/**
 * Export / import on-device. Export is the user's backup; import reads a workout
 * CSV file and creates completed workouts locally.
 */
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { readAsStringAsync } from 'expo-file-system/legacy';

import { atomically, db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type { ImportedSession, ImportResult, SetType } from '../api/types';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { readJsonSet, toJsonSet, type JsonSet } from './backupJson';
import { toWorkoutCsv, parseWorkoutCsv, type ExportWorkout } from './workoutCsv';
import type { Unit } from '../domain/units';
import { equipmentFromNameSuffix } from '../domain/exerciseNaming';
import { parseServerDate } from '../lib/serverTime';
import { initialsOf } from './exercisesRepo';
import { exerciseKey, planImport, workoutKey } from './importPlan';
import { prCountHolders, recomputeForExercise, reflagExercisePrs } from './recordStore';
import { getBodyweightKg } from '../lib/bodyweight';
import { getCountWarmups } from '../lib/warmupVolume';

type FullSet = { position: number; type: string; weight: number | null; reps: number | null; done: boolean; isPr: boolean; rpe: number | null };
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
        sets: sets.map((s) => ({ position: s.position, type: s.type, weight: s.weight, reps: s.reps, done: s.done !== 0, isPr: s.isPr !== 0, rpe: s.rpe ?? null })),
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
        sets: ex.sets.map(toJsonSet),
      })),
    })),
  });
}

async function findOrCreateExercise(
  name: string,
  cache: Map<string, string>,
  exec: Executor = db,
): Promise<{ id: string; created: boolean }> {
  const key = exerciseKey(name);
  const cached = cache.get(key);
  if (cached) return { id: cached, created: false };
  // Match case-insensitively: SQLite's default `=` is case-sensitive, so an exact
  // match created a duplicate custom exercise whenever an import's casing differed
  // from the catalog ("bench press" vs "Bench Press"). Reuse the existing row.
  const existing = await exec
    .select()
    .from(schema.exercises)
    .where(sql`lower(trim(${schema.exercises.name})) = ${key}`)
    .limit(1);
  if (existing[0]) {
    cache.set(key, existing[0].id);
    return { id: existing[0].id, created: false };
  }
  const id = newId();
  // Read equipment off a "Deadlift (Barbell)" style name rather than stamping every
  // import 'other': that one value also gates the duplicate-merge flow, which won't
  // offer a name-based merge unless equipment matches.
  await exec.insert(schema.exercises).values({
    id, userId: LOCAL_USER_ID, name: name.trim(), initials: initialsOf(name.trim()),
    kind: 'weighted', equipment: equipmentFromNameSuffix(name) ?? 'other', isCustom: 1, updatedAt: nowMs(),
  });
  cache.set(key, id);
  return { id, created: true };
}

/** What an import's record pass carries from before its writes to after them. */
type RecordStanding = {
  /** Per touched exercise: the workouts whose `pr_count` holds it, as stored. */
  held: Map<string, Set<string>>;
  exercisesCreated: number;
  currentBw: number | null;
  countWarmups: boolean;
};

/**
 * Before an import writes a workout: resolves every exercise it will touch
 * (creating the ones the database has never seen) and reads which workouts
 * already count each among their PRs.
 *
 * Read first because `reflagExercisePrs` replaces an exercise's share of those
 * counts, and can only do that knowing what the share was while the history
 * still stood as stored. An edit does the same around its own writes.
 */
async function recordStandingBefore(
  exerciseNames: readonly string[],
  cache: Map<string, string>,
  tx: Executor,
  currentBw: number | null,
  countWarmups: boolean,
): Promise<RecordStanding> {
  const held = new Map<string, Set<string>>();
  let exercisesCreated = 0;
  for (const name of exerciseNames) {
    const { id, created } = await findOrCreateExercise(name, cache, tx);
    if (created) exercisesCreated++;
    if (!held.has(id)) held.set(id, await prCountHolders(id, tx, currentBw, countWarmups));
  }
  return { held, exercisesCreated, currentBw, countWarmups };
}

/**
 * After an import's rows are written: for every exercise it touched, the PR
 * flags across the exercise's whole history, each workout's `pr_count`, and
 * the materialised records (#91).
 *
 * The whole history, not just the new rows: imported sessions are usually
 * older than what is already logged, and an older best takes the star from the
 * later set that had it. The flags come from the same walk an edit uses, so
 * imported history and logged history read as one log kept in date order.
 */
async function rederiveRecords(standing: RecordStanding, tx: Executor): Promise<void> {
  const { held, currentBw, countWarmups } = standing;
  for (const [exId, heldBefore] of held) {
    await reflagExercisePrs(exId, tx, currentBw, countWarmups, heldBefore);
    await recomputeForExercise(exId, tx, currentBw, countWarmups);
  }
}

/**
 * Import a file — an Ischys JSON backup (full fidelity: notes, supersets,
 * effort ratings) or a workout CSV. Sniffs the format so the caller doesn't have to.
 * `weightUnit` is a fallback for a CSV whose weight column doesn't name its unit;
 * a JSON backup and an explicit `weight_kg` column ignore it.
 */
export async function importFile(
  file: { uri: string; name: string; mimeType?: string },
  opts?: { weightUnit?: Unit },
): Promise<ImportResult> {
  const text = await readAsStringAsync(file.uri);
  const looksJson =
    text.trimStart().startsWith('{') ||
    /\.json$/i.test(file.name) ||
    (file.mimeType ?? '').includes('json');
  return looksJson ? importJsonBackup(text) : importWorkoutCsv(text, opts);
}

async function importWorkoutCsv(text: string, opts?: { weightUnit?: Unit }): Promise<ImportResult> {
  const parsed = parseWorkoutCsv(text, opts);

  const cache = new Map<string, string>();
  let workoutsCreated = 0;
  let exercisesCreated = 0;
  let setsImported = 0;
  const warnings: string[] = [];
  const importedSessions: ImportedSession[] = [];

  // Resolved BEFORE the transaction: its body may await nothing but database
  // statements (db/atomic.ts), and SecureStore really waits. Threads into
  // per-workout volume + the record pass.
  const countWarmups = await getCountWarmups();
  const currentBw = await getBodyweightKg();
  let duplicatesSkipped = 0;

  // All-or-nothing, in one real transaction: an import that fails or is
  // force-quit halfway stores nothing, so there are no half-imported workouts
  // for the idempotency check below to skip, flagless, on the retry. What is
  // already stored is read inside it too, so the plan is made from the same
  // database it is written to.
  await atomically(async (tx) => {
    // Idempotency: a completed workout is identified by (name, startedAt) — the key
    // parseWorkoutCsv groups on. Re-importing the same export, or a later overlapping one,
    // must not duplicate history. Timeless rows (no parseable start) can't be keyed,
    // so they always import.
    const seen = new Set(
      (await tx.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))).map(
        (w) => workoutKey(w.name, w.startedAt),
      ),
    );
    const plan = planImport(
      parsed.workouts.map((pw) => ({
        workout: pw,
        key: pw.startedAt === null ? null : workoutKey(pw.title, pw.startedAt),
        exerciseNames: pw.exercises.map((pe) => pe.title),
      })),
      seen,
    );
    duplicatesSkipped = plan.duplicatesSkipped;

    const standing = await recordStandingBefore(plan.exercises, cache, tx, currentBw, countWarmups);
    exercisesCreated = standing.exercisesCreated;

    for (const pw of plan.accepted) {
      const startedAt = pw.startedAt ?? nowMs();
      const wid = newId();
      // A CSV can state duration either as an end time or as a "24m" column; keep
      // endedAt consistent with whichever we got, and fall back to a zero-length
      // workout only when the file said nothing at all.
      const durationSeconds = pw.durationSeconds ?? 0;
      const endedAt =
        pw.endedAt ?? (durationSeconds > 0 ? startedAt + durationSeconds * 1000 : startedAt);
      await tx.insert(schema.workouts).values({
        id: wid, userId: LOCAL_USER_ID, name: pw.title, status: 'completed',
        startedAt, endedAt, durationSeconds, updatedAt: nowMs(),
      });
      const allSets: SetLike[] = [];
      for (let p = 0; p < pw.exercises.length; p++) {
        const pe = pw.exercises[p];
        // Resolved, and created if new, by `recordStandingBefore` above.
        const { id: exId } = await findOrCreateExercise(pe.title, cache, tx);
        const weId = newId();
        await tx.insert(schema.workoutExercises).values({
          id: weId, workoutId: wid, exerciseId: exId, position: p,
          restSeconds: 120, supersetGroup: pe.superset, updatedAt: nowMs(),
        });
        for (let j = 0; j < pe.sets.length; j++) {
          const ps = pe.sets[j];
          await tx.insert(schema.workoutSets).values({
            id: newId(), workoutExerciseId: weId, position: j, type: ps.type,
            weight: ps.weight, reps: ps.reps, rpe: ps.rpe, done: 1, completedAt: startedAt, updatedAt: nowMs(),
          });
          allSets.push({ type: ps.type as SetType, weight: ps.weight, reps: ps.reps, done: true });
          setsImported++;
        }
      }
      await tx.update(schema.workouts).set({
        totalVolume: workoutVolume(allSets, 0, countWarmups), totalSets: countWorkingSets(allSets), updatedAt: nowMs(),
      }).where(eq(schema.workouts.id, wid));
      workoutsCreated++;
      // Reported so the success screen can offer to rebuild routines from this
      // history; a workout the file never named has no routine name to offer.
      if (pw.titled) {
        importedSessions.push({
          workout_id: wid,
          title: pw.title,
          started_at: startedAt,
          exercise_count: pw.exercises.length,
        });
      }
    }

    await rederiveRecords(standing, tx);
  });

  if (duplicatesSkipped > 0) {
    warnings.push(`${duplicatesSkipped} workout${duplicatesSkipped === 1 ? '' : 's'} already imported, skipped`);
  }
  // Recognising no columns used to look identical to importing an empty file.
  if (parsed.unmapped) {
    warnings.push("Couldn't recognise this CSV's columns — nothing was imported");
  }

  return {
    workouts_created: workoutsCreated,
    exercises_created: exercisesCreated,
    sets_imported: setsImported,
    rows_skipped: parsed.rowsSkipped,
    warnings,
    imported_sessions: importedSessions,
  };
}

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
 * the CSV path this is loss-free — it keeps exercise notes, superset groups and
 * each workout's exact structure. Idempotent by (name, started_at).
 *
 * The backup's `is_pr` values are read past, not restored: PR flags are
 * re-derived for every exercise the restore touches (`rederiveRecords`). A
 * flag says "this was a record when it was logged", which is a statement
 * about the history it is being restored into, not about the file — a backup
 * merged into a database with other sessions, written under another warm-up
 * setting, or exported while its own history was half flagged would carry
 * stars the surrounding log contradicts. The file never restored `pr_count`
 * either, so a trusted flag had no count beside it.
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
  let workoutsSkipped = 0;
  const warnings: string[] = [];
  // A JSON backup carries workouts only — `exportData` writes no routines — so a
  // restore loses the user's routines exactly as a CSV import does, and the
  // success screen gets the same offer to rebuild them.
  const importedSessions: ImportedSession[] = [];

  // A workout with no readable date cannot be placed in history at all.
  const dated: { w: JsonWorkout; rawName: string; name: string; startedAt: number }[] = [];
  for (const w of workoutsIn) {
    const rawName = (w.name ?? '').trim();
    const startedAt = parseServerDate(w.started_at ?? '');
    if (Number.isNaN(startedAt)) {
      workoutsSkipped++;
      continue;
    }
    dated.push({ w, rawName, name: rawName || 'Workout', startedAt });
  }

  // Resolved before the transaction, whose body may await only database
  // statements (db/atomic.ts).
  const countWarmups = await getCountWarmups();
  const currentBw = await getBodyweightKg();
  let duplicatesSkipped = 0;

  // One real transaction, as the CSV import: all of the restore, or none.
  await atomically(async (tx) => {
    const seen = new Set(
      (await tx.select().from(schema.workouts).where(eq(schema.workouts.status, 'completed'))).map(
        (w) => workoutKey(w.name, w.startedAt),
      ),
    );
    const plan = planImport(
      dated.map((d) => ({
        workout: d,
        key: workoutKey(d.name, d.startedAt),
        exerciseNames: (Array.isArray(d.w.exercises) ? d.w.exercises : []).map((pe) => pe.name ?? ''),
      })),
      seen,
    );
    duplicatesSkipped = plan.duplicatesSkipped;

    const standing = await recordStandingBefore(plan.exercises, cache, tx, currentBw, countWarmups);
    exercisesCreated = standing.exercisesCreated;

    for (const { w, rawName, name, startedAt } of plan.accepted) {
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
      let exercisesInWorkout = 0;
      for (let p = 0; p < exs.length; p++) {
        const pe = exs[p];
        const exName = (pe.name ?? '').trim();
        if (!exName) continue;
        exercisesInWorkout++;
        // Resolved, and created if new, by `recordStandingBefore` above.
        const { id: exId } = await findOrCreateExercise(exName, cache, tx);
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
          const ps = readJsonSet(psets[j]);
          const { done, weight, reps } = ps;
          const type = ps.type as SetType;
          await tx.insert(schema.workoutSets).values({
            id: newId(),
            workoutExerciseId: weId,
            position: j,
            type,
            weight,
            reps,
            rpe: ps.rpe,
            done: done ? 1 : 0,
            // Not the backup's `is_pr`: decided below, against this history.
            isPr: 0,
            completedAt: done ? startedAt : null,
            updatedAt: nowMs(),
          });
          allSets.push({ type, weight, reps, done });
          setsImported++;
        }
      }
      await tx
        .update(schema.workouts)
        .set({ totalVolume: workoutVolume(allSets, 0, countWarmups), totalSets: countWorkingSets(allSets), updatedAt: nowMs() })
        .where(eq(schema.workouts.id, wid));
      workoutsCreated++;
      if (rawName) {
        importedSessions.push({
          workout_id: wid,
          title: rawName,
          started_at: startedAt,
          exercise_count: exercisesInWorkout,
        });
      }
    }

    await rederiveRecords(standing, tx);
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
    imported_sessions: importedSessions,
  };
}
