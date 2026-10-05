/**
 * Materialized personal-records store — port of record_store.py. Recomputes a
 * single exercise's PR rows from its full completed history (via domain/records)
 * and upserts them, deleting metrics that no longer have evidence. Touches the DB.
 */
import { and, eq, gt, inArray } from 'drizzle-orm';

import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type { RecordMetric } from '../api/types';
import {
  computeRecords,
  countsTowardPrCount,
  walkPrFlags,
  type PRSession,
  type PrWalkStep,
  type RecordValue,
} from '../domain/records';
import { resolveWorkoutBodyweight } from '../lib/bodyweight';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { completedSessionsFor } from './queries';

/** Current materialized PR values for an exercise (metric -> value). */
export async function currentValues(
  exerciseId: string,
  exec: Executor = db,
): Promise<Partial<Record<RecordMetric, number>>> {
  const rows = await exec
    .select()
    .from(schema.personalRecords)
    .where(eq(schema.personalRecords.exerciseId, exerciseId));
  const out: Partial<Record<RecordMetric, number>> = {};
  for (const r of rows) out[r.metric as RecordMetric] = r.value;
  return out;
}

/**
 * An exercise's completed sessions, newest first: as stored, and as the
 * records domain reads them.
 *
 * Bodyweight movements count the mover's mass toward volume. The exercise's
 * kind is uniform across its sessions; each session uses its snapshot mass,
 * falling back to the current setting for pre-feature history.
 */
async function historyFor(exerciseId: string, exec: Executor, currentBw: number | null) {
  const sessions = await completedSessionsFor(exerciseId, exec);
  const exRow = (await exec.select({ kind: schema.exercises.kind }).from(schema.exercises).where(eq(schema.exercises.id, exerciseId)))[0];
  const kind = (exRow?.kind as 'weighted' | 'bodyweight') ?? 'weighted';
  const prSessions: PRSession[] = sessions.map((s) => ({
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
  return { sessions, prSessions };
}

/**
 * Recompute + upsert an exercise's PRs from its completed history.
 *
 * `currentBw` (the current bodyweight setting, kg) and `countWarmups` (whether
 * warmups count toward volume) are passed in, NOT read here: this runs inside DB
 * transactions (finish, merge, import), and a foreign async call like SecureStore
 * inside an expo-sqlite transaction hangs it. Callers resolve both before opening
 * their transaction.
 */
export async function recomputeForExercise(
  exerciseId: string,
  exec: Executor = db,
  currentBw: number | null = null,
  countWarmups = false,
): Promise<Partial<Record<RecordMetric, RecordValue>>> {
  const { prSessions } = await historyFor(exerciseId, exec, currentBw);
  const computed = computeRecords(prSessions, countWarmups);

  const existing = await exec
    .select()
    .from(schema.personalRecords)
    .where(eq(schema.personalRecords.exerciseId, exerciseId));
  const byMetric = new Map(existing.map((r) => [r.metric as RecordMetric, r]));

  for (const rv of Object.values(computed) as RecordValue[]) {
    const row = byMetric.get(rv.metric);
    const fields = {
      value: rv.value,
      display: rv.display,
      achievedAt: rv.achievedAt ?? null,
      workoutSetId: rv.workoutSetId ?? null,
      updatedAt: nowMs(),
    };
    if (row) {
      await exec.update(schema.personalRecords).set(fields).where(eq(schema.personalRecords.id, row.id));
    } else {
      await exec.insert(schema.personalRecords).values({
        id: newId(),
        userId: LOCAL_USER_ID,
        exerciseId,
        metric: rv.metric,
        ...fields,
      });
    }
  }
  // Metrics with no evidence left are removed (their supporting sessions vanished).
  for (const [metric, row] of byMetric) {
    if (!(metric in computed)) {
      await exec.delete(schema.personalRecords).where(eq(schema.personalRecords.id, row.id));
    }
  }
  return computed;
}

/**
 * The workouts whose `pr_count` currently holds this exercise. Read BEFORE a
 * change to history, and handed to `reflagExercisePrs` after it: the count is
 * a bare number, so the exercise's share has to be known to be replaced.
 */
export async function prCountHolders(
  exerciseId: string,
  exec: Executor = db,
  currentBw: number | null = null,
  countWarmups = false,
): Promise<Set<string>> {
  const { sessions, prSessions } = await historyFor(exerciseId, exec, currentBw);
  const out = new Set<string>();
  if (sessions.length === 0) return out;
  const counted = await exec
    .select({ id: schema.workouts.id, prCount: schema.workouts.prCount })
    .from(schema.workouts)
    .where(and(eq(schema.workouts.status, 'completed'), gt(schema.workouts.prCount, 0)));
  const prCount = new Map(counted.map((w) => [w.id, w.prCount]));
  const steps = new Map(walkPrFlags(prSessions, countWarmups).map((s) => [s.sessionId, s]));
  for (const s of sessions) {
    const flagged = s.sets.some((set) => set.isPr !== 0);
    if (countsTowardPrCount(steps.get(s.workoutId), flagged, prCount.get(s.workoutId) ?? 0)) {
      out.add(s.workoutId);
    }
  }
  return out;
}

/**
 * Re-decides which of an exercise's sets are records, across its whole
 * completed history, and keeps each workout's `pr_count` in step.
 *
 * `is_pr` and `pr_count` are decided once, at finish, against the records as
 * they stood. Change a past session — its numbers, or its date — and every
 * later decision may be wrong: a lowered best should hand its star to the
 * later set that is now the record, a raised one should take stars away. So
 * the history is walked oldest to newest (domain `walkPrFlags`, the finish
 * path's own comparison) and each set's flag is written to match.
 *
 * `heldBefore` is `prCountHolders` for this exercise, read before the change.
 * A workout's count moves by one where the exercise started or stopped setting
 * a record in it; every other exercise's share of that count is left alone.
 *
 * Runs inside the caller's transaction, so — as `recomputeForExercise` —
 * `currentBw` and `countWarmups` are resolved by the caller before it opens.
 * Returns the walk, keyed by workout id.
 */
export async function reflagExercisePrs(
  exerciseId: string,
  exec: Executor,
  currentBw: number | null,
  countWarmups: boolean,
  heldBefore: ReadonlySet<string>,
): Promise<Map<string, PrWalkStep>> {
  const { sessions, prSessions } = await historyFor(exerciseId, exec, currentBw);
  const steps = new Map(walkPrFlags(prSessions, countWarmups).map((s) => [s.sessionId, s]));

  const raise: string[] = [];
  const lower: string[] = [];
  for (const s of sessions) {
    const want = new Set(steps.get(s.workoutId)?.flaggedSetIds ?? []);
    for (const set of s.sets) {
      const has = set.isPr !== 0;
      if (has !== want.has(set.id)) (has ? lower : raise).push(set.id);
    }
  }
  // In slices: a long history can move more flags than one statement takes.
  const write = async (ids: string[], isPr: 0 | 1) => {
    for (let i = 0; i < ids.length; i += 400) {
      await exec
        .update(schema.workoutSets)
        .set({ isPr, updatedAt: nowMs() })
        .where(inArray(schema.workoutSets.id, ids.slice(i, i + 400)));
    }
  };
  await write(lower, 0);
  await write(raise, 1);

  // Workouts the exercise has left altogether are in `heldBefore` only.
  const workoutIds = new Set([...sessions.map((s) => s.workoutId), ...heldBefore]);
  for (const wid of workoutIds) {
    const held = heldBefore.has(wid);
    const holds = (steps.get(wid)?.deltas.length ?? 0) > 0;
    if (held === holds) continue;
    const row = (
      await exec
        .select({ prCount: schema.workouts.prCount })
        .from(schema.workouts)
        .where(eq(schema.workouts.id, wid))
    )[0];
    if (!row) continue;
    await exec
      .update(schema.workouts)
      .set({ prCount: Math.max(0, row.prCount + (holds ? 1 : -1)), updatedAt: nowMs() })
      .where(eq(schema.workouts.id, wid));
  }
  return steps;
}
