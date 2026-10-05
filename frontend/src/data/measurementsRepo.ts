/**
 * Body measurements storage (#65).
 *
 * Values are canonical on the way in and out — cm, kg, plain percent — so a
 * unit change is a display concern and never rewrites history. Conversion is
 * `domain/measurements`; this only persists.
 */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { atomically, db } from '../db/client';
import * as schema from '../db/schema';
import { newId } from '../db/ids';
import { nowMs } from './ids';
import type { MetricId } from '../domain/measurements';

export type MeasurementRow = {
  id: string;
  metric: MetricId;
  /** Canonical: cm for lengths, kg for masses, plain number for percent. */
  value: number;
  measuredAt: number;
  source: 'manual' | 'health';
};

const toRow = (r: typeof schema.bodyMeasurements.$inferSelect): MeasurementRow => ({
  id: r.id,
  metric: r.metric as MetricId,
  value: r.value,
  measuredAt: r.measuredAt,
  source: (r.source as 'manual' | 'health') ?? 'manual',
});

/** Every reading for one metric, oldest first — the shape a chart wants. */
export async function measurementHistory(metric: MetricId): Promise<MeasurementRow[]> {
  const rows = await db
    .select()
    .from(schema.bodyMeasurements)
    .where(and(eq(schema.bodyMeasurements.metric, metric), eq(schema.bodyMeasurements.deleted, 0)))
    .orderBy(asc(schema.bodyMeasurements.measuredAt));
  return rows.map(toRow);
}

/**
 * The newest reading of each metric.
 *
 * One query over everything rather than one per metric: there are ten metrics
 * and this drives a card on a tab, so ten round trips would be ten chances to
 * stall it.
 */
export async function latestMeasurements(): Promise<Map<MetricId, MeasurementRow>> {
  const rows = await db
    .select()
    .from(schema.bodyMeasurements)
    .where(eq(schema.bodyMeasurements.deleted, 0))
    .orderBy(desc(schema.bodyMeasurements.measuredAt));
  const out = new Map<MetricId, MeasurementRow>();
  for (const r of rows) {
    const m = r.metric as MetricId;
    if (!out.has(m)) out.set(m, toRow(r));
  }
  return out;
}

/** Records a reading the user typed. `value` must already be canonical. */
export async function addMeasurement(
  metric: MetricId,
  value: number,
  measuredAt = nowMs(),
): Promise<void> {
  await db.insert(schema.bodyMeasurements).values({
    id: newId(),
    metric,
    value,
    measuredAt,
    source: 'manual',
    updatedAt: nowMs(),
  });
}

/** Writes several at once — the entry sheet logs a sitting, not a field. */
export async function addMeasurements(
  entries: { metric: MetricId; value: number }[],
  measuredAt = nowMs(),
): Promise<void> {
  if (entries.length === 0) return;
  await atomically(async (tx) => {
    for (const e of entries) {
      await tx.insert(schema.bodyMeasurements).values({
        id: newId(),
        metric: e.metric,
        value: e.value,
        measuredAt,
        source: 'manual',
        updatedAt: nowMs(),
      });
    }
  });
}

/**
 * Upserts a reading that came from Apple Health.
 *
 * Keyed on the HealthKit uuid so a re-read updates the same row rather than
 * appending a duplicate on every sync. Health rows are read-only in Ischys;
 * nothing is ever written back.
 */
export async function upsertHealthMeasurement(
  metric: MetricId,
  value: number,
  measuredAt: number,
  healthUuid: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(schema.bodyMeasurements)
    .where(eq(schema.bodyMeasurements.healthUuid, healthUuid));
  if (existing.length > 0) {
    await db
      .update(schema.bodyMeasurements)
      .set({ value, measuredAt, updatedAt: nowMs() })
      .where(eq(schema.bodyMeasurements.id, existing[0].id));
    return;
  }
  await db.insert(schema.bodyMeasurements).values({
    id: newId(),
    metric,
    value,
    measuredAt,
    source: 'health',
    healthUuid,
    updatedAt: nowMs(),
  });
}

/** Soft-delete, matching how the rest of the schema retires rows. */
export async function deleteMeasurements(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.bodyMeasurements)
    .set({ deleted: 1, updatedAt: nowMs() })
    .where(inArray(schema.bodyMeasurements.id, ids));
}
