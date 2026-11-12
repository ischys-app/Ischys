/**
 * Where a workout's Apple Health entry is recorded (#90): the HKWorkout's UUID
 * and who wrote it, in two nullable columns on `workouts`.
 *
 * What to record is decided in domain/healthEntry.ts, and lib/healthSync.ts is
 * the only caller. Touches the DB (drizzle/expo), so it is never node-tested.
 *
 * Each takes the connection to use. Health is the phone owner's only (#117),
 * and a finish sync can outlive a switch to someone else's profile, so
 * healthSync passes `deviceDb` (always the owner's file) rather than `db`.
 */
import { and, desc, eq, ne } from 'drizzle-orm';

import { db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import { healthEntryFromRow, type HealthEntry } from '../domain/healthEntry';

export async function getWorkoutHealthEntry(
  workoutId: string,
  ex: Executor = db,
): Promise<HealthEntry | null> {
  const row = (
    await ex
      .select({
        uuid: schema.workouts.healthWorkoutUuid,
        writer: schema.workouts.healthWorkoutWriter,
      })
      .from(schema.workouts)
      .where(eq(schema.workouts.id, workoutId))
  )[0];
  return row ? healthEntryFromRow(row.uuid, row.writer) : null;
}

/**
 * Null clears both columns: the workout has no entry in Health (any more).
 *
 * `updatedAt` is left alone. The entry is a fact about this device's Health
 * store, not a change to the workout.
 */
export async function setWorkoutHealthEntry(
  workoutId: string,
  entry: HealthEntry | null,
  ex: Executor = db,
): Promise<void> {
  await ex
    .update(schema.workouts)
    .set({
      healthWorkoutUuid: entry?.uuid ?? null,
      healthWorkoutWriter: entry?.writer ?? null,
    })
    .where(eq(schema.workouts.id, workoutId));
}

/**
 * True when a workout OTHER than `workoutId` already records this Health
 * entry. An entry is one workout's, so a lookup by time must not hand a
 * neighbour's to a second one.
 */
export async function healthEntryHeldByAnother(
  uuid: string,
  workoutId: string,
  ex: Executor = db,
): Promise<boolean> {
  const rows = await ex
    .select({ id: schema.workouts.id })
    .from(schema.workouts)
    .where(and(eq(schema.workouts.healthWorkoutUuid, uuid), ne(schema.workouts.id, workoutId)))
    .limit(1);
  return rows.length > 0;
}

/** A workout's span, for matching a watch session to it (lib/wearSession.ts). */
export type WorkoutSpan = {
  id: string;
  status: string;
  startedAt: number;
  durationSeconds: number;
};

/** The latest `limit` workouts' spans, newest first. */
export async function recentWorkoutSpans(limit: number, ex: Executor = db): Promise<WorkoutSpan[]> {
  return ex
    .select({
      id: schema.workouts.id,
      status: schema.workouts.status,
      startedAt: schema.workouts.startedAt,
      durationSeconds: schema.workouts.durationSeconds,
    })
    .from(schema.workouts)
    .orderBy(desc(schema.workouts.startedAt), desc(schema.workouts.id))
    .limit(limit);
}
