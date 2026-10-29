/**
 * The profiles registry (#117): which profiles exist on this device, their
 * names, order, and cached workout stats. It lives in the owner's `ischys.db`
 * only, so every function here runs on `deviceDb`, never on the `db` facade
 * (which follows the current profile).
 *
 * Not to be confused with `profileRepo.ts`, the Profile screen's stats.
 */
import { asc, eq, sql } from 'drizzle-orm';

import { deviceDb, openConnection } from '../db/client';
import * as schema from '../db/schema';
import { deriveInitials, OWNER_ID, type ProfileRow } from '../domain/profiles';
import { newId, nowMs } from './ids';

type Row = typeof schema.profiles.$inferSelect;

function toProfile(r: Row): ProfileRow {
  return {
    id: r.id,
    name: r.name,
    initials: r.initials,
    sort: r.sort,
    isOwner: r.isOwner !== 0,
    createdAt: r.createdAt,
    workoutCount: r.workoutCount,
    firstWorkoutAt: r.firstWorkoutAt,
    lastWorkoutAt: r.lastWorkoutAt,
  };
}

/** Every profile, in display order. */
export async function listProfiles(): Promise<ProfileRow[]> {
  const rows = await deviceDb.select().from(schema.profiles).orderBy(asc(schema.profiles.sort));
  return rows.map(toProfile);
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const rows = await deviceDb.select().from(schema.profiles).where(eq(schema.profiles.id, id)).limit(1);
  return rows.length > 0 ? toProfile(rows[0]) : null;
}

/**
 * Registers the owner (the data that predates profiles) the first time the app
 * runs with a registry. Leaves an existing owner row alone.
 */
export async function ensureOwnerProfile(legacyName: string): Promise<void> {
  await deviceDb
    .insert(schema.profiles)
    .values({
      id: OWNER_ID,
      name: legacyName,
      initials: deriveInitials(legacyName),
      sort: 0,
      isOwner: 1,
      createdAt: nowMs(),
    })
    .onConflictDoNothing({ target: schema.profiles.id });
}

/** Adds a profile at the end of the list. */
export async function insertProfile(name: string, initials: string): Promise<ProfileRow> {
  const id = newId();
  const createdAt = nowMs();
  // Read the max and insert in one transaction, so two quick adds can't share a sort.
  return openConnection(OWNER_ID).atomic.atomically(async () => {
    const [{ max }] = await deviceDb
      .select({ max: sql<number | null>`max(${schema.profiles.sort})` })
      .from(schema.profiles);
    const sort = (max ?? -1) + 1;
    await deviceDb.insert(schema.profiles).values({ id, name, initials, sort, isOwner: 0, createdAt });
    return {
      id,
      name,
      initials,
      sort,
      isOwner: false,
      createdAt,
      workoutCount: 0,
      firstWorkoutAt: null,
      lastWorkoutAt: null,
    };
  });
}

export async function updateProfile(id: string, patch: { name?: string; initials?: string }): Promise<void> {
  const set: { name?: string; initials?: string } = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.initials !== undefined) set.initials = patch.initials;
  if (Object.keys(set).length === 0) return;
  await deviceDb.update(schema.profiles).set(set).where(eq(schema.profiles.id, id));
}

/** Gives each id its position in `ids` as its sort. Ids not listed keep theirs. */
export async function reorderProfiles(ids: readonly string[]): Promise<void> {
  await openConnection(OWNER_ID).atomic.atomically(async () => {
    for (let i = 0; i < ids.length; i++) {
      await deviceDb.update(schema.profiles).set({ sort: i }).where(eq(schema.profiles.id, ids[i]));
    }
  });
}

export async function deleteProfileRow(id: string): Promise<void> {
  await deviceDb.delete(schema.profiles).where(eq(schema.profiles.id, id));
}

/** Caches a profile's workout stats for the list (no need to open its file). */
export async function writeProfileStats(
  id: string,
  s: { workoutCount: number; firstWorkoutAt: number | null; lastWorkoutAt: number | null },
): Promise<void> {
  await deviceDb
    .update(schema.profiles)
    .set({ workoutCount: s.workoutCount, firstWorkoutAt: s.firstWorkoutAt, lastWorkoutAt: s.lastWorkoutAt })
    .where(eq(schema.profiles.id, id));
}
