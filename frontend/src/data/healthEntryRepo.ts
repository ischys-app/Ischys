/**
 * Where a workout's Apple Health entry is recorded (#90): the HKWorkout's UUID
 * and who wrote it, in two nullable columns on `workouts`.
 *
 * What to record is decided in domain/healthEntry.ts, and lib/healthSync.ts is
 * the only caller. Touches the DB (drizzle/expo), so it is never node-tested.
 */
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import { healthEntryFromRow, type HealthEntry } from '../domain/healthEntry';

export async function getWorkoutHealthEntry(workoutId: string): Promise<HealthEntry | null> {
  const row = (
    await db
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
): Promise<void> {
  await db
    .update(schema.workouts)
    .set({
      healthWorkoutUuid: entry?.uuid ?? null,
      healthWorkoutWriter: entry?.writer ?? null,
    })
    .where(eq(schema.workouts.id, workoutId));
}
