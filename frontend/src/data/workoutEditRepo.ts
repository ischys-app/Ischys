/**
 * Loading and saving an edit to a finished workout (#83).
 *
 * The edit itself is domain/workoutEdit.ts: this file only reads the workout
 * into that model's shape and applies the plan it produces. Touches the DB
 * (drizzle/expo), so it is never node-tested.
 *
 * Nothing here starts or touches a Live Activity, a Watch session, a rest
 * notification or HealthKit. A finished workout is history; saving an edit is
 * a database write and nothing else.
 */
import { and, eq, inArray } from 'drizzle-orm';

import type { SetType, WorkoutSummaryOut } from '../api/types';
import { atomically, db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import { headlinePr, type PRSession } from '../domain/records';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { volumeByMuscle } from '../domain/volumeByMuscle';
import type { EditPlan, OriginalWorkout, RecordContext } from '../domain/workoutEdit';
import { getBodyweightKg, resolveWorkoutBodyweight } from '../lib/bodyweight';
import { getSummary, saveSummary } from '../lib/summaryCache';
import { getCountWarmups } from '../lib/warmupVolume';
import { nowMs } from './ids';
import type { WorkoutSetRow } from './map';
import { completedSessionsFor, loadWorkout, muscleLabel } from './queries';
import { prCountHolders, recomputeForExercise, reflagExercisePrs } from './recordStore';

type Kind = 'weighted' | 'bodyweight';

/** One exercise's completed sessions as the records domain reads them. */
function toPrSessions(
  sessions: Awaited<ReturnType<typeof completedSessionsFor>>,
  kind: Kind,
  currentBw: number | null,
): PRSession[] {
  return sessions.map((s) => ({
    id: s.workoutId,
    achievedAt: s.startedAt,
    bodyweightKg: resolveWorkoutBodyweight(s.bodyweightKg, currentBw),
    sets: s.sets.map((set) => ({
      id: set.id,
      type: set.type,
      weight: set.weight,
      reps: set.reps,
      done: set.done !== 0,
      kind,
    })),
  }));
}

async function kindOf(exerciseId: string, exec: Executor = db): Promise<Kind> {
  const row = (
    await exec
      .select({ kind: schema.exercises.kind })
      .from(schema.exercises)
      .where(eq(schema.exercises.id, exerciseId))
  )[0];
  return (row?.kind as Kind) ?? 'weighted';
}

/**
 * Every OTHER completed session of an exercise, newest first — what a record
 * falls back to when this workout stops holding it.
 */
export async function loadExerciseHistory(
  exerciseId: string,
  excludeWorkoutId: string,
): Promise<PRSession[]> {
  const currentBw = await getBodyweightKg();
  const sessions = await completedSessionsFor(exerciseId);
  return toPrSessions(
    sessions.filter((s) => s.workoutId !== excludeWorkoutId),
    await kindOf(exerciseId),
    currentBw,
  );
}

export type EditContext = { original: OriginalWorkout; records: RecordContext };

/**
 * A finished workout in the edit model's shape, with what the record preview
 * needs. Null when there is no such workout or it is not finished — a live one
 * is edited on its own screen, and a discarded one is not history.
 */
export async function loadWorkoutForEdit(workoutId: string): Promise<EditContext | null> {
  const row = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, workoutId)))[0];
  if (!row || row.status !== 'completed') return null;
  const w = await loadWorkout(workoutId);
  if (!w) return null;

  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  const history: Record<string, PRSession[]> = {};
  for (const we of w.exercises) {
    const id = we.exercise.id;
    if (history[id]) continue;
    const sessions = await completedSessionsFor(id);
    history[id] = toPrSessions(
      sessions.filter((s) => s.workoutId !== workoutId),
      we.exercise.kind,
      currentBw,
    );
  }

  return {
    original: {
      id: w.id,
      name: w.name,
      // From the row, not the DTO's ISO string: the model holds the stored
      // instant exactly, so an untouched start is never rewritten.
      startedAt: row.startedAt,
      durationSeconds: row.durationSeconds,
      endedAt: row.endedAt ?? null,
      exercises: w.exercises.map((we) => ({
        id: we.id,
        exerciseId: we.exercise.id,
        name: we.exercise.name,
        initials: we.exercise.initials,
        equipment: we.exercise.equipment,
        kind: we.exercise.kind,
        rest: we.rest_seconds,
        note: we.note ?? '',
        supersetGroup: we.superset_group ?? null,
        position: we.position,
        sets: we.sets.map((s) => ({
          id: s.id,
          type: s.type,
          weight: s.weight,
          reps: s.reps,
          done: s.done,
          rpe: s.rpe ?? null,
          position: s.position,
        })),
      })),
    },
    records: {
      history,
      // The mass the workout was performed at, as its volume was computed.
      bodyweightKg: resolveWorkoutBodyweight(row.bodyweightKg, currentBw),
      countWarmups,
    },
  };
}

type SummaryPr = WorkoutSummaryOut['prs'][number];

/**
 * Applies an edit: one transaction, then nothing.
 *
 * Inside it, in order: the removals, the exercise and set changes, the
 * workout's own row (date, duration, volume, set count), and then, for every
 * exercise the edit touched, its record flags across its whole history
 * (`reflagExercisePrs`) and its materialised records (`recomputeForExercise`)
 * — which is what withdraws a record the edit removed and lets the next best
 * session take it back.
 *
 * Bodyweight and the warm-up setting are read BEFORE the transaction opens:
 * both live in SecureStore, and awaiting SecureStore inside an expo-sqlite
 * transaction hangs it (see recordStore.ts).
 */
export async function saveWorkoutEdit(plan: EditPlan): Promise<void> {
  const wid = plan.workoutId;
  const w = (await db.select().from(schema.workouts).where(eq(schema.workouts.id, wid)))[0];
  if (!w) throw new Error('workout not found');
  if (w.status !== 'completed') throw new Error(`workout not finished (${w.status})`);
  // Editing never deletes a workout, never stores an exercise with no sets,
  // and never drops a half-typed set. The screen keeps Save inert in these
  // states; this is the same rule for any other caller.
  if (plan.setCount === 0) throw new Error('a workout needs at least one set');
  if (plan.blocked) throw new Error('the edit has a set or an exercise that cannot be saved');

  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  const startedAt = plan.startedAt ?? w.startedAt;
  const recordsMoved = plan.touchedExerciseIds.length > 0;
  const prs: { exerciseId: string; pr: Omit<SummaryPr, 'exercise_id' | 'exercise_name'> }[] = [];

  await atomically(async (tx) => {
    // Which workouts count each touched exercise among their PRs, as stored.
    // Read before anything moves; `reflagExercisePrs` replaces that share.
    const heldBefore = new Map<string, Set<string>>();
    for (const eid of plan.touchedExerciseIds) {
      heldBefore.set(eid, await prCountHolders(eid, tx, currentBw, countWarmups));
    }

    // --- removals -----------------------------------------------------------
    // No FK cascades in the schema, so an exercise's sets go first.
    for (const weId of plan.removedExerciseIds) {
      await tx.delete(schema.workoutSets).where(eq(schema.workoutSets.workoutExerciseId, weId));
      await tx
        .delete(schema.workoutExercises)
        .where(and(eq(schema.workoutExercises.id, weId), eq(schema.workoutExercises.workoutId, wid)));
    }
    if (plan.removedSetIds.length > 0) {
      await tx.delete(schema.workoutSets).where(inArray(schema.workoutSets.id, plan.removedSetIds));
    }

    // --- exercises ----------------------------------------------------------
    for (const p of plan.updatedExercises) {
      const patch: Record<string, unknown> = { updatedAt: nowMs() };
      if (p.position !== undefined) patch.position = p.position;
      if (p.supersetGroup !== undefined) patch.supersetGroup = p.supersetGroup;
      if (p.exerciseId !== undefined) patch.exerciseId = p.exerciseId;
      if (p.clearNote) patch.note = null;
      await tx
        .update(schema.workoutExercises)
        .set(patch)
        .where(and(eq(schema.workoutExercises.id, p.id), eq(schema.workoutExercises.workoutId, wid)));
    }
    for (const ex of plan.addedExercises) {
      await tx.insert(schema.workoutExercises).values({
        id: ex.id,
        workoutId: wid,
        exerciseId: ex.exerciseId,
        position: ex.position,
        restSeconds: ex.restSeconds,
        supersetGroup: ex.supersetGroup,
        note: null,
        updatedAt: nowMs(),
      });
      for (const s of ex.sets) {
        await tx.insert(schema.workoutSets).values({
          id: s.id,
          workoutExerciseId: ex.id,
          position: s.position,
          type: s.type,
          weight: s.weight,
          reps: s.reps,
          done: s.done ? 1 : 0,
          // History has no moment a set was ticked; imports use the start too.
          completedAt: s.done ? startedAt : null,
          updatedAt: nowMs(),
        });
      }
    }

    // --- sets ---------------------------------------------------------------
    // `rpe` is never in a patch, so a set's effort rating survives any edit.
    for (const p of plan.updatedSets) {
      const patch: Record<string, unknown> = { updatedAt: nowMs() };
      if (p.position !== undefined) patch.position = p.position;
      if (p.type !== undefined) patch.type = p.type;
      if (p.weight !== undefined) patch.weight = p.weight;
      if (p.reps !== undefined) patch.reps = p.reps;
      if (p.done !== undefined) {
        patch.done = p.done ? 1 : 0;
        patch.completedAt = p.done ? startedAt : null;
      }
      await tx.update(schema.workoutSets).set(patch).where(eq(schema.workoutSets.id, p.id));
    }
    for (const s of plan.addedSets) {
      await tx.insert(schema.workoutSets).values({
        id: s.id,
        workoutExerciseId: s.workoutExerciseId,
        position: s.position,
        type: s.type,
        weight: s.weight,
        reps: s.reps,
        done: s.done ? 1 : 0,
        completedAt: s.done ? startedAt : null,
        updatedAt: nowMs(),
      });
    }

    // --- the workout's own row ---------------------------------------------
    const wes = await tx
      .select()
      .from(schema.workoutExercises)
      .where(eq(schema.workoutExercises.workoutId, wid));
    const weIds = wes.map((we) => we.id);
    const exerciseIds = [...new Set(wes.map((we) => we.exerciseId))];
    const allSets = weIds.length
      ? ((await tx
          .select()
          .from(schema.workoutSets)
          .where(inArray(schema.workoutSets.workoutExerciseId, weIds))) as WorkoutSetRow[])
      : [];
    const kindRows = exerciseIds.length
      ? await tx
          .select({ id: schema.exercises.id, kind: schema.exercises.kind })
          .from(schema.exercises)
          .where(inArray(schema.exercises.id, exerciseIds))
      : [];
    const kindByExerciseId = new Map(kindRows.map((e) => [e.id, e.kind as Kind]));
    const kindByWeId = new Map(wes.map((we) => [we.id, kindByExerciseId.get(we.exerciseId)]));
    const setLikes: SetLike[] = allSets.map((s) => ({
      type: s.type as SetType,
      weight: s.weight,
      reps: s.reps,
      done: s.done !== 0,
      kind: kindByWeId.get(s.workoutExerciseId),
    }));

    const when: Record<string, unknown> = {};
    if (plan.startedAt != null) when.startedAt = plan.startedAt;
    if (plan.durationSeconds != null) when.durationSeconds = plan.durationSeconds;
    if (plan.endedAt != null) when.endedAt = plan.endedAt;
    await tx
      .update(schema.workouts)
      .set({
        ...when,
        // The snapshot taken at finish stays: the edit corrects what was
        // lifted, not the mass it was lifted at. A workout with no snapshot
        // counts no bodyweight, as finish and import store it — not today's.
        totalVolume: workoutVolume(setLikes, w.bodyweightKg ?? 0, countWarmups),
        totalSets: countWorkingSets(setLikes),
        updatedAt: nowMs(),
      })
      .where(eq(schema.workouts.id, wid));

    if (!recordsMoved) return;

    // --- the records, across each touched exercise's whole history ----------
    // Not just this workout's: a best lowered here hands its flag to the later
    // set that is now the record, and a date moved here reorders who was first.
    // Exercises the edit did not touch are not re-decided at all.
    for (const eid of plan.touchedExerciseIds) {
      const steps = await reflagExercisePrs(
        eid,
        tx,
        currentBw,
        countWarmups,
        heldBefore.get(eid) ?? new Set(),
      );
      const head = headlinePr(steps.get(wid)?.deltas ?? []);
      if (head) {
        prs.push({
          exerciseId: eid,
          pr: {
            metric: head.metric,
            value: head.value.value,
            delta: head.previous === null ? null : head.delta,
            display: head.value.display,
            delta_display: head.deltaDisplay,
          },
        });
      }
      // The materialised records themselves: what withdraws one the edit
      // removed and lets the next best session take it back.
      await recomputeForExercise(eid, tx, currentBw, countWarmups);
    }
  });

  // The edit is committed. A cache that fails to refresh must not be reported
  // as a save that failed: a retry would insert the same rows a second time.
  try {
    await refreshCachedSummary(wid, recordsMoved ? { touched: plan.touchedExerciseIds, prs } : null);
  } catch {
    // The Summary re-reads the database the next time it is opened cold.
  }
}

/**
 * The Summary shown straight after Finish renders a cached payload, not the
 * database, so it would keep showing the workout as it was. Only refreshed
 * when there is one: a workout opened from History has no cached payload, and
 * giving it one would switch that Summary into its just-finished mode.
 */
async function refreshCachedSummary(
  wid: string,
  records: {
    touched: string[];
    prs: { exerciseId: string; pr: Omit<SummaryPr, 'exercise_id' | 'exercise_name'> }[];
  } | null,
): Promise<void> {
  const cached = getSummary(wid);
  if (!cached) return;
  const workout = await loadWorkout(wid);
  if (!workout) return;
  let prs = cached.prs;
  if (records) {
    // A touched exercise shows what the save decided; the rest keep the
    // record they were shown with, as long as they are still in the workout.
    const touched = new Set(records.touched);
    const decided = new Map(records.prs.map((p) => [p.exerciseId, p.pr]));
    const kept = new Map(cached.prs.map((p) => [p.exercise_id, p]));
    prs = [];
    for (const id of new Set(workout.exercises.map((we) => we.exercise.id))) {
      const name = workout.exercises.find((we) => we.exercise.id === id)?.exercise.name ?? '';
      const pr = decided.get(id);
      const old = kept.get(id);
      if (touched.has(id)) {
        if (pr) prs.push({ exercise_id: id, exercise_name: name, ...pr });
      } else if (old) {
        prs.push(old);
      }
    }
  }
  saveSummary(wid, {
    workout,
    prs,
    volume_by_muscle: volumeByMuscle(
      workout.exercises.map((we) => ({
        muscleLabel: muscleLabel(
          we.exercise.primary_muscle
            ? {
                id: we.exercise.primary_muscle.id,
                name: we.exercise.primary_muscle.name,
                group: we.exercise.primary_muscle.group ?? null,
              }
            : null,
        ),
        sets: we.sets.map((s) => ({
          type: s.type,
          weight: s.weight,
          reps: s.reps,
          done: s.done,
          kind: we.exercise.kind,
        })),
      })),
    ),
  });
}
