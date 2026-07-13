/**
 * Materialized personal-records store — port of record_store.py. Recomputes a
 * single exercise's PR rows from its full completed history (via domain/records)
 * and upserts them, deleting metrics that no longer have evidence. Touches the DB.
 */
import { eq } from 'drizzle-orm';

import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type { RecordMetric } from '../api/types';
import { computeRecords, type PRSession, type RecordValue } from '../domain/records';
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

/** Recompute + upsert an exercise's PRs from its completed history. */
export async function recomputeForExercise(
  exerciseId: string,
  exec: Executor = db,
): Promise<Partial<Record<RecordMetric, RecordValue>>> {
  const sessions = await completedSessionsFor(exerciseId, exec);
  const prSessions: PRSession[] = sessions.map((s) => ({
    id: s.workoutId,
    achievedAt: s.startedAt,
    sets: s.sets.map((set) => ({
      id: set.id,
      type: set.type,
      weight: set.weight,
      reps: set.reps,
      done: set.done !== 0,
    })),
  }));
  const computed = computeRecords(prSessions);

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
