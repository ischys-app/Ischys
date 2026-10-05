/**
 * Workout lifecycle on-device — ported from the original server implementation.
 * Reads assemble DTOs via ./queries + ./map; writes bump updated_at;
 * finish computes aggregates + materializes PRs via ./recordStore. Touches the
 * DB (drizzle/expo) — never node-tested. No FK cascades in the schema, so child
 * rows are deleted explicitly.
 */
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';

import { atomically, db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type {
  PreviousSetOut,
  RecordMetric,
  SetType,
  WorkoutExerciseOut,
  WorkoutListItem,
  WorkoutOut,
  WorkoutSetOut,
  WorkoutSummaryOut,
} from '../api/types';
import { activityMap } from '../domain/activityMap';
import { uniqueRoutineName } from '../domain/importedRoutines';
import { normalizeRpe } from '../domain/effort';
import { latestBefore } from '../domain/previous';
import { detectPrs, headlinePr } from '../domain/records';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { volumeByMuscle } from '../domain/volumeByMuscle';
import { initialsOf } from './exercisesRepo';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toWorkoutListItem, toWorkoutSetOut, type WorkoutRow, type WorkoutSetRow } from './map';
import {
  completedSessionsFor,
  loadWorkout,
  muscleLabel,
  muscleTagsByWorkout,
} from './queries';
import { currentValues, prCountHolders, recomputeForExercise, reflagExercisePrs } from './recordStore';
import { getBodyweightKg } from '../lib/bodyweight';
import { getCountWarmups } from '../lib/warmupVolume';

const asSetLike = (s: WorkoutSetRow, kind?: 'weighted' | 'bodyweight'): SetLike => ({
  type: s.type as SetType,
  weight: s.weight,
  reps: s.reps,
  done: s.done !== 0,
  kind,
});

// --- Reads ---

export async function getWorkout(id: string): Promise<WorkoutOut> {
  const w = await loadWorkout(id);
  if (!w) throw new Error('workout not found');
  return w;
}

export async function listWorkouts(
  params: { limit?: number; status?: string } = {},
): Promise<WorkoutListItem[]> {
  const where = params.status ? eq(schema.workouts.status, params.status) : undefined;
  const rows = await db
    .select()
    .from(schema.workouts)
    .where(where)
    .orderBy(desc(schema.workouts.startedAt))
    .limit(params.limit ?? 50);
  const tags = await muscleTagsByWorkout(rows.map((w) => w.id));
  return rows.map((w) => toWorkoutListItem(w as WorkoutRow, tags.get(w.id) ?? []));
}

export async function getActivityMap(weeks = 12): Promise<ReturnType<typeof activityMap>> {
  const rows = await db
    .select({ startedAt: schema.workouts.startedAt })
    .from(schema.workouts)
    .where(eq(schema.workouts.status, 'completed'));
  return activityMap(rows.map((r) => r.startedAt), weeks, new Date());
}

// --- Previous-session resolver (prefill + prev-column hint) ---

async function previousSets(exerciseId: string, beforeMs: number): Promise<WorkoutSetRow[]> {
  const sessions = await completedSessionsFor(exerciseId);
  const prev = latestBefore(
    sessions.map((s) => ({ id: s.workoutId, startedAt: s.startedAt })),
    beforeMs,
  );
  if (!prev) return [];
  const found = sessions.find((s) => s.workoutId === prev.id);
  return (found?.sets ?? []).slice().sort((a, b) => a.position - b.position);
}

export async function getPrevious(_wid: string, weId: string): Promise<PreviousSetOut[]> {
  const we = (await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.id, weId)))[0];
  if (!we) return [];
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, we.workoutId)))[0];
  const before = w ? w.startedAt : nowMs();
  const sets = await previousSets(we.exerciseId, before);
  return sets.map((s) => ({
    position: s.position,
    type: s.type as SetType,
    weight: s.weight,
    reps: s.reps,
    rpe: s.rpe ?? null,
  }));
}

/**
 * The note left on this exercise in the immediately-previous completed session
 * (null if that session had none). Mirrors how sets prefill from the last time —
 * so a note you change or clear this session is what carries forward next time,
 * rather than the most recent non-empty note ever, which made a once-set note
 * (e.g. from an imported sample) impossible to get rid of.
 */
async function previousNote(exerciseId: string, beforeMs: number): Promise<string | null> {
  const row = (await db
    .select({ note: schema.workoutExercises.note })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(
      and(
        eq(schema.workoutExercises.exerciseId, exerciseId),
        eq(schema.workouts.status, 'completed'),
        lt(schema.workouts.startedAt, beforeMs),
      ),
    )
    .orderBy(desc(schema.workouts.startedAt))
    .limit(1))[0];
  const n = row?.note?.trim();
  return n && n.length > 0 ? n : null;
}

/**
 * Placeholder note for a workout-exercise: your last session's note, else the
 * routine's own note for this exercise (a deliberately-authored template hint).
 * It is only ever a hint — never a saved value — so it can't get stuck.
 */
export async function getPreviousNote(weId: string): Promise<string | null> {
  const we = (await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.id, weId)))[0];
  if (!we) return null;
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, we.workoutId)))[0];
  const prev = await previousNote(we.exerciseId, w ? w.startedAt : nowMs());
  if (prev) return prev;
  if (w?.routineId) {
    const re = (await db
      .select({ note: schema.routineExercises.note })
      .from(schema.routineExercises)
      .where(and(eq(schema.routineExercises.routineId, w.routineId), eq(schema.routineExercises.exerciseId, we.exerciseId)))
      .limit(1))[0];
    const n = re?.note?.trim();
    if (n && n.length > 0) return n;
  }
  return null;
}

/** Persist an exercise's note within a workout. Empty/whitespace clears it. */
export async function setWorkoutExerciseNote(weId: string, note: string | null): Promise<void> {
  const keep = note && note.trim().length > 0 ? note : null;
  await db
    .update(schema.workoutExercises)
    .set({ note: keep, updatedAt: nowMs() })
    .where(eq(schema.workoutExercises.id, weId));
}

/**
 * Persist a mid-workout change to an exercise's rest duration. Without this the
 * change lived only in screen state, so the finish-time routine diff (which reads
 * the DB) never saw it.
 */
export async function setWorkoutExerciseRest(weId: string, seconds: number): Promise<void> {
  await db
    .update(schema.workoutExercises)
    .set({ restSeconds: seconds, updatedAt: nowMs() })
    .where(eq(schema.workoutExercises.id, weId));
}

// --- Writes ---

export async function startWorkout(body: { routine_id?: string; name?: string }): Promise<WorkoutOut> {
  const id = newId();
  const startedAt = nowMs();
  let name = body.name || 'Empty Workout';

  const routine = body.routine_id
    ? (await db.select().from(schema.routines).where(eq(schema.routines.id, body.routine_id)))[0]
    : undefined;
  if (body.routine_id && !routine) throw new Error('routine not found');
  if (routine) name = body.name || routine.name;

  // One unit: a start cut short would leave a live workout holding only some
  // of its routine, with nothing to say the rest is missing.
  await atomically(async () => {
    await db.insert(schema.workouts).values({
      id,
      userId: LOCAL_USER_ID,
      routineId: body.routine_id ?? null,
      name,
      status: 'active',
      startedAt,
      updatedAt: nowMs(),
    });

    if (routine) {
      const res = await db
        .select()
        .from(schema.routineExercises)
        .where(eq(schema.routineExercises.routineId, routine.id))
        .orderBy(asc(schema.routineExercises.position));
      for (const re of res) {
        const weId = newId();
        await db.insert(schema.workoutExercises).values({
          id: weId,
          workoutId: id,
          exerciseId: re.exerciseId,
          position: re.position,
          restSeconds: re.restSeconds,
          // Carry the grouping, or starting a routine would silently break its
          // supersets apart.
          supersetGroup: re.supersetGroup ?? null,
          // The routine's note is a template hint, surfaced via getPreviousNote as a
          // placeholder — not frozen onto the session as a value. Freezing it meant a
          // routine's note (e.g. inherited from an imported sample) reappeared every
          // workout and edits never stuck, since they never wrote back to the routine.
          note: null,
          updatedAt: nowMs(),
        });
        const rsets = await db
          .select()
          .from(schema.routineSets)
          .where(eq(schema.routineSets.routineExerciseId, re.id))
          .orderBy(asc(schema.routineSets.position));
        // Prefill from the last completed session (by position), else the target.
        const prev = await previousSets(re.exerciseId, startedAt);
        const prevByPos = new Map(prev.map((s) => [s.position, s]));
        for (const rs of rsets) {
          const p = prevByPos.get(rs.position);
          await db.insert(schema.workoutSets).values({
            id: newId(),
            workoutExerciseId: weId,
            position: rs.position,
            type: rs.type,
            weight: p && p.weight !== null ? p.weight : rs.targetWeight,
            reps: p && p.reps !== null ? p.reps : rs.targetReps,
            done: 0,
            updatedAt: nowMs(),
          });
        }
      }
    }
  });
  return getWorkout(id);
}

export async function patchSet(
  setId: string,
  body: {
    type?: SetType;
    weight?: number | null;
    reps?: number | null;
    done?: boolean;
    /** Effort as RPE; null clears the rating. Anything off the scale is dropped. */
    rpe?: number | null;
  },
): Promise<WorkoutSetOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
  if (body.rpe !== undefined) patch.rpe = normalizeRpe(body.rpe);
  if (body.type !== undefined) patch.type = body.type;
  if (body.weight !== undefined) patch.weight = body.weight;
  if (body.reps !== undefined) patch.reps = body.reps;
  if (body.done !== undefined) {
    patch.done = body.done ? 1 : 0;
    patch.completedAt = body.done ? nowMs() : null;
  }
  await db.update(schema.workoutSets).set(patch).where(eq(schema.workoutSets.id, setId));
  const row = (await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.id, setId)))[0];
  // A patch that matched no row means the set was never persisted (a caller
  // writing against an unpersisted id). Fail loudly rather than crash on undefined.
  if (!row) throw new Error(`patchSet: set ${setId} not found`);
  return toWorkoutSetOut(row as WorkoutSetRow);
}

export async function addSetApi(
  _wid: string,
  weId: string,
  body: { id?: string; type: SetType; weight?: number | null; reps?: number | null; done: boolean },
): Promise<WorkoutSetOut> {
  // Accept a caller-supplied id so the UI can create the row under the same id it
  // already renders — no temp-id swap, so an immediate edit can't miss the row.
  const id = body.id ?? newId();
  // Read the max position and insert atomically: two rapid taps must not both read
  // the same position and collide.
  await atomically(async (tx) => {
    const existing = await tx.select().from(schema.workoutSets).where(eq(schema.workoutSets.workoutExerciseId, weId));
    const position = existing.reduce((max, s) => Math.max(max, s.position + 1), 0);
    await tx.insert(schema.workoutSets).values({
      id,
      workoutExerciseId: weId,
      position,
      type: body.type,
      weight: body.weight ?? null,
      reps: body.reps ?? null,
      done: body.done ? 1 : 0,
      completedAt: body.done ? nowMs() : null,
      updatedAt: nowMs(),
    });
  });
  const row = (await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.id, id)))[0];
  if (!row) throw new Error(`addSetApi: insert of ${id} failed`);
  return toWorkoutSetOut(row as WorkoutSetRow);
}

/**
 * Inserts warm-up sets at the TOP of an exercise, shifting the existing sets
 * down — the only insert that isn't an append.
 *
 * A warm-up below a working set isn't a warm-up, and `addSetApi` always appends,
 * so this renumbers rather than reusing it. One transaction: a half-applied
 * shift would leave two sets sharing a position, and the set list is ordered by
 * position alone.
 */
export async function insertWarmupSets(
  weId: string,
  rows: { id?: string; weight: number | null; reps: number | null }[],
): Promise<void> {
  if (rows.length === 0) return;
  await atomically(async (tx) => {
    const existing = await tx
      .select()
      .from(schema.workoutSets)
      .where(eq(schema.workoutSets.workoutExerciseId, weId));
    // Shift from the bottom up so no intermediate state collides with a row
    // that hasn't moved yet.
    const shifted = existing.slice().sort((a, b) => b.position - a.position);
    for (const row of shifted) {
      await tx
        .update(schema.workoutSets)
        .set({ position: row.position + rows.length, updatedAt: nowMs() })
        .where(eq(schema.workoutSets.id, row.id));
    }
    for (const [i, r] of rows.entries()) {
      await tx.insert(schema.workoutSets).values({
        id: r.id ?? newId(),
        workoutExerciseId: weId,
        position: i,
        type: 'warmup',
        weight: r.weight,
        reps: r.reps,
        done: 0,
        completedAt: null,
        updatedAt: nowMs(),
      });
    }
  });
}

/**
 * Puts a set of workout-exercises into one superset group, or breaks a group up.
 *
 * The group id is just a shared number — it carries no meaning beyond "these
 * belong together", so a fresh one per group is enough and the display letters
 * are derived from reading order instead.
 *
 * A group left holding one exercise is not a superset, so it dissolves rather
 * than lingering as a one-member group that renders a rail around nothing.
 */
export async function setSupersetGroup(weIds: string[], group: number | null): Promise<void> {
  if (weIds.length === 0) return;
  await atomically((tx) => writeSupersetGroup(tx, weIds, group));
}

/** Statements only: runs inside the caller's transaction. */
async function writeSupersetGroup(tx: Executor, weIds: string[], group: number | null): Promise<void> {
  for (const id of weIds) {
    await tx
      .update(schema.workoutExercises)
      .set({ supersetGroup: group, updatedAt: nowMs() })
      .where(eq(schema.workoutExercises.id, id));
  }
}

/** A group number not currently in use by this workout. */
export async function nextSupersetGroup(workoutId: string): Promise<number> {
  return unusedSupersetGroup(db, workoutId);
}

async function unusedSupersetGroup(ex: Executor, workoutId: string): Promise<number> {
  const rows = await ex
    .select({ g: schema.workoutExercises.supersetGroup })
    .from(schema.workoutExercises)
    .where(eq(schema.workoutExercises.workoutId, workoutId));
  const used = rows.map((r) => r.g ?? 0);
  return (used.length ? Math.max(...used) : 0) + 1;
}

export async function deleteSet(setId: string): Promise<void> {
  // One unit: the delete and the renumbering it leaves the others owing.
  await atomically(async () => {
    const set = (await db.select().from(schema.workoutSets).where(eq(schema.workoutSets.id, setId)))[0];
    if (!set) return;
    await db.delete(schema.workoutSets).where(eq(schema.workoutSets.id, setId));
    // Renumber the remaining sets of that exercise contiguously.
    const rest = await db
      .select()
      .from(schema.workoutSets)
      .where(eq(schema.workoutSets.workoutExerciseId, set.workoutExerciseId))
      .orderBy(asc(schema.workoutSets.position));
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].position !== i) {
        await db.update(schema.workoutSets).set({ position: i, updatedAt: nowMs() }).where(eq(schema.workoutSets.id, rest[i].id));
      }
    }
  });
}

export async function removeWorkoutExercise(_wid: string, weId: string): Promise<void> {
  await atomically(async () => {
    await db.delete(schema.workoutSets).where(eq(schema.workoutSets.workoutExerciseId, weId));
    await db.delete(schema.workoutExercises).where(eq(schema.workoutExercises.id, weId));
  });
}

export async function reorderExercises(wid: string, order: string[]): Promise<WorkoutOut> {
  await atomically(async () => {
    for (let i = 0; i < order.length; i++) {
      await db.update(schema.workoutExercises).set({ position: i, updatedAt: nowMs() }).where(eq(schema.workoutExercises.id, order[i]));
    }
  });
  return getWorkout(wid);
}

type AddExerciseBody = {
  exercise_id: string;
  rest_seconds?: number;
  note?: string;
  sets?: { type: SetType; weight?: number | null; reps?: number | null; done: boolean }[];
};
type AddExerciseSets = NonNullable<AddExerciseBody['sets']>;

/** The sets a newly added exercise starts with. Reads only; called before the transaction. */
async function setsForAddedExercise(workoutId: string, body: AddExerciseBody): Promise<AddExerciseSets> {
  if (body.sets) return body.sets;
  // No explicit sets: prefill from this exercise's last completed session (the
  // same carry-forward a routine gives), so re-adding an exercise you've done
  // shows your latest weights/reps instead of coming in blank. Fall back to a
  // single empty set when there's no history.
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, workoutId)))[0];
  const prev = await previousSets(body.exercise_id, w ? w.startedAt : nowMs());
  return prev.length
    ? prev.map((s) => ({ type: s.type as SetType, weight: s.weight, reps: s.reps, done: false }))
    : [{ type: 'normal' as SetType, done: false }];
}

/** Appends one exercise and its sets. Statements only: runs inside the caller's transaction. */
async function insertWorkoutExercise(
  tx: Executor,
  workoutId: string,
  weId: string,
  body: AddExerciseBody,
  sets: AddExerciseSets,
): Promise<void> {
  const existing = await tx.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, workoutId));
  const position = existing.reduce((max, we) => Math.max(max, we.position + 1), 0);
  await tx.insert(schema.workoutExercises).values({
    id: weId,
    workoutId,
    exerciseId: body.exercise_id,
    position,
    restSeconds: body.rest_seconds ?? 120,
    note: body.note ?? null,
    updatedAt: nowMs(),
  });
  for (let i = 0; i < sets.length; i++) {
    await tx.insert(schema.workoutSets).values({
      id: newId(),
      workoutExerciseId: weId,
      position: i,
      type: sets[i].type,
      weight: sets[i].weight ?? null,
      reps: sets[i].reps ?? null,
      done: sets[i].done ? 1 : 0,
      completedAt: sets[i].done ? nowMs() : null,
      updatedAt: nowMs(),
    });
  }
}

export async function addWorkoutExercise(
  workoutId: string,
  body: AddExerciseBody,
): Promise<WorkoutExerciseOut> {
  const weId = newId();
  const sets = await setsForAddedExercise(workoutId, body);
  // Position read + inserts atomic: two rapid adds must not read the same
  // position and collide, and the exercise's sets must land as one unit.
  await atomically((tx) => insertWorkoutExercise(tx, workoutId, weId, body, sets));
  const w = await getWorkout(workoutId);
  return w.exercises.find((e) => e.id === weId)!;
}

/**
 * Adds several exercises in the order given, and with `asSuperset` pairs them
 * under a fresh group, as one unit: all of them land, or none.
 *
 * Adding them one call at a time left the first few stored when a later one
 * failed, and the retry added those again. Each exercise is stored exactly as
 * `addWorkoutExercise` stores it, and the grouping exactly as
 * `nextSupersetGroup` + `setSupersetGroup` do (two or more, or no group).
 */
export async function addWorkoutExercises(
  workoutId: string,
  bodies: AddExerciseBody[],
  opts: { asSuperset?: boolean } = {},
): Promise<WorkoutExerciseOut[]> {
  const planned: { weId: string; body: AddExerciseBody; sets: AddExerciseSets }[] = [];
  for (const body of bodies) {
    planned.push({ weId: newId(), body, sets: await setsForAddedExercise(workoutId, body) });
  }
  if (planned.length === 0) return [];
  await atomically(async (tx) => {
    for (const p of planned) await insertWorkoutExercise(tx, workoutId, p.weId, p.body, p.sets);
    if (opts.asSuperset && planned.length >= 2) {
      const group = await unusedSupersetGroup(tx, workoutId);
      await writeSupersetGroup(tx, planned.map((p) => p.weId), group);
    }
  });
  const w = await getWorkout(workoutId);
  const byId = new Map(w.exercises.map((e) => [e.id, e]));
  return planned.map((p) => byId.get(p.weId)!);
}

export async function discardWorkout(wid: string): Promise<WorkoutOut> {
  await db
    .update(schema.workouts)
    .set({ status: 'discarded', endedAt: nowMs(), updatedAt: nowMs() })
    .where(eq(schema.workouts.id, wid));
  return getWorkout(wid);
}

export async function deleteWorkout(wid: string): Promise<void> {
  // Read before the transaction: its body may await nothing but database
  // statements (db/atomic.ts), and SecureStore really waits.
  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();
  // One unit: the rows, and the records and PR flags re-derived without them.
  await atomically(async () => {
    const wes = await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
    const touched = [...new Set(wes.map((we) => we.exerciseId))];
    const weIds = wes.map((we) => we.id);
    // Which workouts count each exercise among their PRs, read while this one
    // still stands (as an edit does).
    const heldBefore = new Map<string, Set<string>>();
    for (const eid of touched) heldBefore.set(eid, await prCountHolders(eid, db, currentBw, countWarmups));
    if (weIds.length) await db.delete(schema.workoutSets).where(inArray(schema.workoutSets.workoutExerciseId, weIds));
    await db.delete(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
    await db.delete(schema.workouts).where(eq(schema.workouts.id, wid));
    for (const eid of touched) {
      // A record this workout held passes to the next-best set, and to its workout's count.
      await reflagExercisePrs(eid, db, currentBw, countWarmups, heldBefore.get(eid) ?? new Set());
      await recomputeForExercise(eid, db, currentBw, countWarmups); // PRs lose this evidence
    }
  });
}

export async function uploadHeartRate(
  workoutId: string,
  body: { avg_hr: number; max_hr: number },
): Promise<WorkoutOut> {
  await db
    .update(schema.workouts)
    .set({ avgHr: body.avg_hr, maxHr: body.max_hr, updatedAt: nowMs() })
    .where(eq(schema.workouts.id, workoutId));
  return getWorkout(workoutId);
}

// --- Finish (aggregates + PR detection + summary) ---

export async function finishWorkout(wid: string): Promise<WorkoutSummaryOut> {
  // Bodyweight movements count their mover's mass toward volume. Snapshot the
  // current bodyweight onto the workout so its volume is fixed at the mass it was
  // performed at, and use it for this finish's totals + PR recompute.
  //
  // Read first, with whether warmups count toward volume: the transaction's
  // body may await nothing but database statements (db/atomic.ts), and
  // SecureStore really waits.
  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  const prs: {
    exerciseId: string;
    metric: RecordMetric;
    value: number;
    delta: number | null;
    display: string;
    deltaDisplay: string;
  }[] = [];
  // Atomic: mark completed, materialise PRs, flag PR sets, and write prCount as one
  // unit. Otherwise a crash mid-finish leaves a completed workout with wrong/zero
  // prCount that the `status !== 'active'` guard makes unrepairable.
  //
  // The status check and the reads of what was logged are in the same unit.
  // Outside it, with the waits above in between, two finishes both saw
  // `active` (the second found no new records and wrote prCount 0 over the
  // first's), and a set changed during the wait was missing from the totals.
  const { wes, exerciseIds, allSets, kindByWeId } = await atomically(async (tx) => {
    const w = (await tx.select().from(schema.workouts).where(eq(schema.workouts.id, wid)))[0];
    if (!w) throw new Error('workout not found');
    // Only an active session can be finished — guards both an already-completed
    // workout and a discarded one (whose ended_at would skew the duration).
    if (w.status !== 'active') throw new Error(`workout not active (${w.status})`);

    const wes = await tx.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
    const exerciseIds = [...new Set(wes.map((we) => we.exerciseId))];
    const weIds = wes.map((we) => we.id);
    const allSets = (weIds.length
      ? ((await tx.select().from(schema.workoutSets).where(inArray(schema.workoutSets.workoutExerciseId, weIds))) as WorkoutSetRow[])
      : []);

    const kindRows = exerciseIds.length
      ? await tx.select({ id: schema.exercises.id, kind: schema.exercises.kind }).from(schema.exercises).where(inArray(schema.exercises.id, exerciseIds))
      : [];
    const kindByExerciseId = new Map(kindRows.map((e) => [e.id, e.kind as 'weighted' | 'bodyweight']));
    const kindByWeId = new Map(wes.map((we) => [we.id, kindByExerciseId.get(we.exerciseId)]));
    const setLike = (s: WorkoutSetRow): SetLike => asSetLike(s, kindByWeId.get(s.workoutExerciseId));

    const setIds = new Set(allSets.map((s) => s.id));

    // Snapshot each exercise's PR baseline BEFORE this workout counts as completed.
    const baselines = new Map<string, Awaited<ReturnType<typeof currentValues>>>();
    for (const eid of exerciseIds) baselines.set(eid, await currentValues(eid, tx));

    const endedAt = w.endedAt ?? nowMs();
    await tx
      .update(schema.workouts)
      .set({
        status: 'completed',
        endedAt,
        durationSeconds: Math.max(0, Math.floor((endedAt - w.startedAt) / 1000)),
        totalVolume: workoutVolume(allSets.map(setLike), currentBw ?? 0, countWarmups),
        totalSets: countWorkingSets(allSets.map(setLike)),
        bodyweightKg: currentBw,
        updatedAt: nowMs(),
      })
      .where(eq(schema.workouts.id, wid));

    for (const eid of exerciseIds) {
      const computed = await recomputeForExercise(eid, tx, currentBw, countWarmups);
      const deltas = detectPrs(baselines.get(eid) ?? {}, computed);
      for (const d of deltas) {
        if (d.value.workoutSetId && setIds.has(d.value.workoutSetId)) {
          await tx.update(schema.workoutSets).set({ isPr: 1, updatedAt: nowMs() }).where(eq(schema.workoutSets.id, d.value.workoutSetId));
        }
      }
      const head = headlinePr(deltas);
      if (head) {
        prs.push({
          exerciseId: eid,
          metric: head.metric,
          // The numbers travel with the prose so the summary can show both in
          // the user's unit; a first-ever record has no delta to convert.
          value: head.value.value,
          delta: head.previous === null ? null : head.delta,
          display: head.value.display,
          deltaDisplay: head.deltaDisplay,
        });
      }
    }
    await tx.update(schema.workouts).set({ prCount: prs.length, updatedAt: nowMs() }).where(eq(schema.workouts.id, wid));
    return { wes, exerciseIds, allSets, kindByWeId };
  });

  // Assemble the summary.
  const exRows = exerciseIds.length
    ? await db.select().from(schema.exercises).where(inArray(schema.exercises.id, exerciseIds))
    : [];
  const exNameById = new Map(exRows.map((e) => [e.id, e.name]));
  const muscleRows = await db.select().from(schema.muscles);
  const muscleById = new Map(muscleRows.map((m) => [m.id, m]));
  const setsByWe = new Map<string, WorkoutSetRow[]>();
  for (const s of allSets) {
    const list = setsByWe.get(s.workoutExerciseId) ?? [];
    list.push(s);
    setsByWe.set(s.workoutExerciseId, list);
  }
  const exPrimaryById = new Map(exRows.map((e) => [e.id, e.primaryMuscleId ? muscleById.get(e.primaryMuscleId) ?? null : null]));
  const volume_by_muscle = volumeByMuscle(
    wes.map((we) => ({
      muscleLabel: muscleLabel(exPrimaryById.get(we.exerciseId) ?? null),
      sets: (setsByWe.get(we.id) ?? []).map((s) => asSetLike(s, kindByWeId.get(we.id))),
    })),
  );

  return {
    workout: await getWorkout(wid),
    prs: prs.map((p) => ({
      exercise_id: p.exerciseId,
      exercise_name: exNameById.get(p.exerciseId) ?? '',
      metric: p.metric,
      value: p.value,
      delta: p.delta,
      display: p.display,
      delta_display: p.deltaDisplay,
    })),
    volume_by_muscle,
  };
}

// --- Save a finished workout as a routine ---

export async function saveAsRoutine(wid: string): Promise<{ id: string; name: string }> {
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, wid)))[0];
  if (!w) throw new Error('workout not found');
  const wes = await db
    .select()
    .from(schema.workoutExercises)
    .where(eq(schema.workoutExercises.workoutId, wid))
    .orderBy(asc(schema.workoutExercises.position));

  const existing = await db.select().from(schema.routines);
  const lastPos = existing.reduce((m, r) => Math.max(m, r.position + 1), 0);
  // Never overwrite, and never leave two routines a list can't tell apart: a
  // clash becomes "<name> (2)". Matters most when rebuilding routines from an
  // import, but "Save as new" from a routine-backed summary always clashes too.
  const name = uniqueRoutineName(w.name, existing.map((r) => r.name));
  const routineId = newId();
  // One unit: a routine is its exercises and their sets, not the first few.
  await atomically(async () => {
    await db.insert(schema.routines).values({
      id: routineId,
      userId: LOCAL_USER_ID,
      name,
      initials: initialsOf(name),
      position: lastPos,
      updatedAt: nowMs(),
    });
    for (const we of wes) {
      const reId = newId();
      await db.insert(schema.routineExercises).values({
        id: reId,
        routineId,
        exerciseId: we.exerciseId,
        position: we.position,
        restSeconds: we.restSeconds,
        supersetGroup: we.supersetGroup ?? null,
        note: we.note,
        updatedAt: nowMs(),
      });
      const sets = await db
        .select()
        .from(schema.workoutSets)
        .where(eq(schema.workoutSets.workoutExerciseId, we.id))
        .orderBy(asc(schema.workoutSets.position));
      for (const s of sets) {
        await db.insert(schema.routineSets).values({
          id: newId(),
          routineExerciseId: reId,
          position: s.position,
          type: s.type,
          targetWeight: s.weight,
          targetReps: s.reps,
          updatedAt: nowMs(),
        });
      }
    }
  });
  return { id: routineId, name };
}
