/**
 * Idempotently seeds the bundled catalog into SQLite on first run. Touches the
 * DB, so it is never imported by node-tested code. Chunked inserts keep us under
 * SQLite's variable limit.
 */
import { db } from '../client';
import * as schema from '../schema';
import type { Catalog } from './catalogTypes';
import { buildSeedRows } from './seedPlan';

const chunk = <T>(xs: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function seedCatalog(catalog: Catalog): Promise<{ inserted: boolean }> {
  const already = await db.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (already.length > 0) return { inserted: false };

  const rows = buildSeedRows(catalog);
  await db.transaction(async (tx) => {
    await tx.insert(schema.categories).values(rows.categories);
    await tx.insert(schema.muscles).values(rows.muscles);
    for (const part of chunk(rows.exercises, 200)) await tx.insert(schema.exercises).values(part);
    for (const part of chunk(rows.secondary, 400)) {
      await tx.insert(schema.exerciseSecondaryMuscles).values(part);
    }
  });
  return { inserted: true };
}
