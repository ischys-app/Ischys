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

import type { RecordMetric, SetType, WorkoutSummaryOut } from '../api/types';
import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import { computeRecords, detectPrs, headlinePr, type PRSession } from '../domain/records';
import { countWorkingSets, workoutVolume, type SetLike } from '../domain/stats';
import { volumeByMuscle } from '../domain/volumeByMuscle';
import type { EditPlan, OriginalWorkout, RecordContext } from '../domain/workoutEdit';
import { getBodyweightKg, resolveWorkoutBodyweight } from '../lib/bodyweight';
import { getSummary, saveSummary } from '../lib/summaryCache';
import { getCountWarmups } from '../lib/warmupVolume';
import { nowMs } from './ids';
import type { WorkoutSetRow } from './map';
import { completedSessionsFor, loadWorkout, muscleLabel } from './queries';
import { recomputeForExercise } from './recordStore';

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
 * workout's own row (date, duration, volume, set count), the records this
 * workout set, and finally `recomputeForExercise` for every exercise the edit
 * touched — which is what withdraws a record the edit removed and lets the
 * next best session take it back.
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
  // Editing never deletes a workout. The screen keeps Save inert in this
  // state; this is the same rule for any other caller.
  if (plan.setCount === 0) throw new Error('a workout needs at least one set');

  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  const startedAt = plan.startedAt ?? w.startedAt;
  const recordsMoved = plan.touchedExerciseIds.length > 0;
  const prs: { exerciseId: string; pr: Omit<SummaryPr, 'exercise_id' | 'exercise_name'> }[] = [];

  await db.transaction(async (tx) => {
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
        // lifted, not the mass it was lifted at.
        totalVolume: workoutVolume(
          setLikes,
          resolveWorkoutBodyweight(w.bodyweightKg, currentBw),
          countWarmups,
        ),
        totalSets: countWorkingSets(setLikes),
        updatedAt: nowMs(),
      })
      .where(eq(schema.workouts.id, wid));

    if (!recordsMoved) return;

    // --- the records this workout set --------------------------------------
    // Finish decides them by comparing against the records as they stood then.
    // Re-deciding them for a workout in the past means the same comparison
    // against the sessions before it, not against everything since.
    await tx
      .update(schema.workoutSets)
      .set({ isPr: 0, updatedAt: nowMs() })
      .where(and(inArray(schema.workoutSets.workoutExerciseId, weIds), eq(schema.workoutSets.isPr, 1)));
    const ownSetIds = new Set(allSets.map((s) => s.id));
    for (const eid of exerciseIds) {
      const kind = kindByExerciseId.get(eid) ?? 'weighted';
      const sessions = await completedSessionsFor(eid, tx);
      const earlier = sessions.filter((s) => s.workoutId !== wid && s.startedAt < startedAt);
      const own = sessions.filter((s) => s.workoutId === wid);
      const before = computeRecords(toPrSessions(earlier, kind, currentBw), countWarmups);
      const baseline: Partial<Record<RecordMetric, number>> = {};
      for (const rv of Object.values(before)) baseline[rv.metric] = rv.value;
      // This workout first, as `completedSessionsFor` orders it: newest first.
      const after = computeRecords(toPrSessions([...own, ...earlier], kind, currentBw), countWarmups);
      const deltas = detectPrs(baseline, after).filter((d) => d.value.workoutId === wid);
      for (const d of deltas) {
        if (d.value.workoutSetId && ownSetIds.has(d.value.workoutSetId)) {
          await tx
            .update(schema.workoutSets)
            .set({ isPr: 1, updatedAt: nowMs() })
            .where(eq(schema.workoutSets.id, d.value.workoutSetId));
        }
      }
      const head = headlinePr(deltas);
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
    }
    await tx
      .update(schema.workouts)
      .set({ prCount: prs.length, updatedAt: nowMs() })
      .where(eq(schema.workouts.id, wid));

    // --- every touched exercise's records, from its whole history ----------
    for (const eid of plan.touchedExerciseIds) {
      await recomputeForExercise(eid, tx, currentBw, countWarmups);
    }
  });

  await refreshCachedSummary(wid, recordsMoved ? prs : null);
}

/**
 * The Summary shown straight after Finish renders a cached payload, not the
 * database, so it would keep showing the workout as it was. Only refreshed
 * when there is one: a workout opened from History has no cached payload, and
 * giving it one would switch that Summary into its just-finished mode.
 */
async function refreshCachedSummary(
  wid: string,
  prs: { exerciseId: string; pr: Omit<SummaryPr, 'exercise_id' | 'exercise_name'> }[] | null,
): Promise<void> {
  const cached = getSummary(wid);
  if (!cached) return;
  const workout = await loadWorkout(wid);
  if (!workout) return;
  const nameById = new Map(workout.exercises.map((we) => [we.exercise.id, we.exercise.name]));
  saveSummary(wid, {
    workout,
    prs:
      prs === null
        ? cached.prs
        : prs.map((p) => ({
            exercise_id: p.exerciseId,
            exercise_name: nameById.get(p.exerciseId) ?? '',
            ...p.pr,
          })),
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
