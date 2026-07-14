/**
 * Workout lifecycle on-device — ported from the original server implementation.
 * Reads assemble DTOs via ./queries + ./map; writes bump updated_at;
 * finish computes aggregates + materializes PRs via ./recordStore. Touches the
 * DB (drizzle/expo) — never node-tested. No FK cascades in the schema, so child
 * rows are deleted explicitly.
 */
import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type {
  PreviousSetOut,
  SetType,
  WorkoutExerciseOut,
  WorkoutListItem,
  WorkoutOut,
  WorkoutSetOut,
  WorkoutSummaryOut,
} from '../api/types';
import { activityMap } from '../domain/activityMap';
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
import { currentValues, recomputeForExercise } from './recordStore';

const asSetLike = (s: WorkoutSetRow): SetLike => ({
  type: s.type as SetType,
  weight: s.weight,
  reps: s.reps,
  done: s.done !== 0,
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
  return sets.map((s) => ({ position: s.position, type: s.type as SetType, weight: s.weight, reps: s.reps }));
}

/** The most recent non-empty note left on this exercise before `beforeMs`. */
async function previousNote(exerciseId: string, beforeMs: number): Promise<string | null> {
  const rows = await db
    .select({ note: schema.workoutExercises.note, startedAt: schema.workouts.startedAt })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(
      and(
        eq(schema.workoutExercises.exerciseId, exerciseId),
        eq(schema.workouts.status, 'completed'),
        lt(schema.workouts.startedAt, beforeMs),
      ),
    )
    .orderBy(desc(schema.workouts.startedAt));
  for (const r of rows) {
    const n = r.note?.trim();
    if (n) return n;
  }
  return null;
}

/** Previous-session note for this workout-exercise, to show as a placeholder. */
export async function getPreviousNote(weId: string): Promise<string | null> {
  const we = (await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.id, weId)))[0];
  if (!we) return null;
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, we.workoutId)))[0];
  return previousNote(we.exerciseId, w ? w.startedAt : nowMs());
}

/** Persist an exercise's note within a workout. Empty/whitespace clears it. */
export async function setWorkoutExerciseNote(weId: string, note: string | null): Promise<void> {
  const keep = note && note.trim().length > 0 ? note : null;
  await db
    .update(schema.workoutExercises)
    .set({ note: keep, updatedAt: nowMs() })
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
        note: re.note,
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
  return getWorkout(id);
}

export async function patchSet(
  setId: string,
  body: { type?: SetType; weight?: number | null; reps?: number | null; done?: boolean },
): Promise<WorkoutSetOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
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
  await db.transaction(async (tx) => {
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

export async function deleteSet(setId: string): Promise<void> {
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
}

export async function removeWorkoutExercise(_wid: string, weId: string): Promise<void> {
  await db.delete(schema.workoutSets).where(eq(schema.workoutSets.workoutExerciseId, weId));
  await db.delete(schema.workoutExercises).where(eq(schema.workoutExercises.id, weId));
}

export async function reorderExercises(wid: string, order: string[]): Promise<WorkoutOut> {
  for (let i = 0; i < order.length; i++) {
    await db.update(schema.workoutExercises).set({ position: i, updatedAt: nowMs() }).where(eq(schema.workoutExercises.id, order[i]));
  }
  return getWorkout(wid);
}

export async function addWorkoutExercise(
  workoutId: string,
  body: {
    exercise_id: string;
    rest_seconds?: number;
    note?: string;
    sets?: { type: SetType; weight?: number | null; reps?: number | null; done: boolean }[];
  },
): Promise<WorkoutExerciseOut> {
  const weId = newId();
  let sets = body.sets;
  // No explicit sets: prefill from this exercise's last completed session (the
  // same carry-forward a routine gives), so re-adding an exercise you've done
  // shows your latest weights/reps instead of coming in blank. Fall back to a
  // single empty set when there's no history.
  if (!sets) {
    const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, workoutId)))[0];
    const prev = await previousSets(body.exercise_id, w ? w.startedAt : nowMs());
    sets = prev.length
      ? prev.map((s) => ({ type: s.type as SetType, weight: s.weight, reps: s.reps, done: false }))
      : [{ type: 'normal' as SetType, done: false }];
  }
  // Position read + inserts atomic: two rapid adds must not read the same
  // position and collide, and the exercise's sets must land as one unit.
  await db.transaction(async (tx) => {
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
  });
  const w = await getWorkout(workoutId);
  return w.exercises.find((e) => e.id === weId)!;
}

export async function discardWorkout(wid: string): Promise<WorkoutOut> {
  await db
    .update(schema.workouts)
    .set({ status: 'discarded', endedAt: nowMs(), updatedAt: nowMs() })
    .where(eq(schema.workouts.id, wid));
  return getWorkout(wid);
}

export async function deleteWorkout(wid: string): Promise<void> {
  const wes = await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
  const touched = [...new Set(wes.map((we) => we.exerciseId))];
  const weIds = wes.map((we) => we.id);
  if (weIds.length) await db.delete(schema.workoutSets).where(inArray(schema.workoutSets.workoutExerciseId, weIds));
  await db.delete(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
  await db.delete(schema.workouts).where(eq(schema.workouts.id, wid));
  for (const eid of touched) await recomputeForExercise(eid); // PRs lose this evidence
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
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, wid)))[0];
  if (!w) throw new Error('workout not found');
  // Only an active session can be finished — guards both an already-completed
  // workout and a discarded one (whose ended_at would skew the duration).
  if (w.status !== 'active') throw new Error(`workout not active (${w.status})`);

  const wes = await db.select().from(schema.workoutExercises).where(eq(schema.workoutExercises.workoutId, wid));
  const exerciseIds = [...new Set(wes.map((we) => we.exerciseId))];
  const weIds = wes.map((we) => we.id);
  const allSets = (weIds.length
    ? ((await db.select().from(schema.workoutSets).where(inArray(schema.workoutSets.workoutExerciseId, weIds))) as WorkoutSetRow[])
    : []);

  const setIds = new Set(allSets.map((s) => s.id));
  const prs: { exerciseId: string; metric: string; display: string; deltaDisplay: string }[] = [];
  // Atomic: mark completed, materialise PRs, flag PR sets, and write prCount as one
  // unit. Otherwise a crash mid-finish leaves a completed workout with wrong/zero
  // prCount that the `status !== 'active'` guard makes unrepairable.
  await db.transaction(async (tx) => {
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
        totalVolume: workoutVolume(allSets.map(asSetLike)),
        totalSets: countWorkingSets(allSets.map(asSetLike)),
        updatedAt: nowMs(),
      })
      .where(eq(schema.workouts.id, wid));

    for (const eid of exerciseIds) {
      const computed = await recomputeForExercise(eid, tx);
      const deltas = detectPrs(baselines.get(eid) ?? {}, computed);
      for (const d of deltas) {
        if (d.value.workoutSetId && setIds.has(d.value.workoutSetId)) {
          await tx.update(schema.workoutSets).set({ isPr: 1, updatedAt: nowMs() }).where(eq(schema.workoutSets.id, d.value.workoutSetId));
        }
      }
      const head = headlinePr(deltas);
      if (head) prs.push({ exerciseId: eid, metric: head.metric, display: head.value.display, deltaDisplay: head.deltaDisplay });
    }
    await tx.update(schema.workouts).set({ prCount: prs.length, updatedAt: nowMs() }).where(eq(schema.workouts.id, wid));
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
      sets: (setsByWe.get(we.id) ?? []).map(asSetLike),
    })),
  );

  return {
    workout: await getWorkout(wid),
    prs: prs.map((p) => ({
      exercise_id: p.exerciseId,
      exercise_name: exNameById.get(p.exerciseId) ?? '',
      metric: p.metric,
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

  const lastPos = (await db.select().from(schema.routines)).reduce((m, r) => Math.max(m, r.position + 1), 0);
  const routineId = newId();
  await db.insert(schema.routines).values({
    id: routineId,
    userId: LOCAL_USER_ID,
    name: w.name,
    initials: initialsOf(w.name),
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
  return { id: routineId, name: w.name };
}
