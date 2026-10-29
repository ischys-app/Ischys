/**
 * Launch: migrates and seeds the owner's `ischys.db`, registers the owner in
 * the profiles registry, then opens the profile the app should launch into
 * (#117). `ready` gates the UI until this completes.
 */
import * as SecureStore from 'expo-secure-store';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect, useState } from 'react';

import catalog from '../../assets/catalog/catalog.json';
import migrations from '../../drizzle/migrations';
import * as schema from './schema';
import type { Catalog } from './catalog/catalogTypes';
import { seedCatalog } from './catalog/seedCatalog';
import {
  closeConnection,
  currentConnection,
  openConnection,
  useConnection,
  type ProfileConnection,
} from './client';
import { dedupeExercisesByName } from '../data/exercisesRepo';
import { ensureOwnerProfile, listProfiles } from '../data/profilesRepo';
import { OWNER_ID, parseActiveWorkout, resolveLaunchProfile } from '../domain/profiles';
import { DEFAULT_NAME } from '../lib/profileName';

/** The owner's name from before profiles existed (profileName.ts's key). */
const LEGACY_NAME_KEY = 'ischys.profile.name';
const ACTIVE_PROFILE_KEY = 'ischys.activeProfileId';
const ACTIVE_WORKOUT_KEY = 'ischys.activeWorkoutId';

/** Ensure the singleton settings row exists (column defaults fill the rest). */
async function ensureLocalSettings(conn: ProfileConnection): Promise<void> {
  const existing = await conn.drizzle.select({ id: schema.settings.id }).from(schema.settings).limit(1);
  if (existing.length > 0) return;
  await conn.drizzle.insert(schema.settings).values({ id: 'local', updatedAt: Date.now() });
}

/** Runs the file's pending migrations. `conn.drizzle` is the full Drizzle
 * handle, typed with `transaction` narrowed (client.ts), hence the cast. */
function runMigrations(conn: ProfileConnection): Promise<void> {
  return migrate(conn.drizzle as unknown as ExpoSQLiteDatabase<typeof schema>, migrations);
}

/**
 * Seeds the catalog and the settings row and folds name duplicates in an
 * already-migrated file. The helpers run on the `db` facade, so `db` is pointed
 * at `conn` while they run and handed back afterwards.
 */
async function seedConnection(conn: ProfileConnection): Promise<void> {
  const previous = currentConnection();
  useConnection(conn);
  try {
    await seedCatalog(catalog as Catalog);
    await ensureLocalSettings(conn);
    // Fold import-created name duplicates into their catalog original. Best
    // effort — never let a dedup hiccup keep the app from starting.
    await dedupeExercisesByName().catch(() => 0);
  } finally {
    useConnection(previous);
  }
}

/**
 * Migrates a profile's file, then seeds it. Every profile file goes through
 * this before `db` is pointed at it. Don't call it while an `atomically`
 * transaction is open: `db` moves to `conn` while the seeding runs.
 */
export async function prepareConnection(conn: ProfileConnection): Promise<void> {
  await runMigrations(conn);
  await seedConnection(conn);
}

function readSecure(key: string): string | null {
  try {
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

async function legacyOwnerName(): Promise<string> {
  try {
    const raw = (await SecureStore.getItemAsync(LEGACY_NAME_KEY))?.trim();
    return raw && raw.length > 0 ? raw : DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

/** The profile to launch into: a running workout's, else the last used, else the owner. */
async function launchProfileId(): Promise<string> {
  const registryIds = (await listProfiles()).map((p) => p.id);
  return resolveLaunchProfile({
    registryIds,
    lastUsedId: readSecure(ACTIVE_PROFILE_KEY),
    activeWorkoutProfileId: parseActiveWorkout(readSecure(ACTIVE_WORKOUT_KEY))?.profileId ?? null,
  });
}

/** Opens, prepares and switches to a non-owner profile. On failure `db` stays on the owner. */
async function enterProfile(id: string): Promise<void> {
  const conn = openConnection(id);
  try {
    await prepareConnection(conn);
  } catch (e) {
    closeConnection(conn);
    throw e;
  }
  useConnection(conn);
}

const asError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/** What launch reached: `ready` false only when the owner's file can't be migrated. */
type Outcome = { ready: boolean; error: Error | null };

async function launch(): Promise<Outcome> {
  const owner = openConnection(OWNER_ID);
  // 1. The owner's file. Its migrations failing is fatal, as before profiles:
  // the splash stays, with the error reported.
  try {
    await runMigrations(owner);
  } catch (e) {
    return { ready: false, error: asError(e) };
  }
  // From here a failure is reported but the app still starts, on the owner,
  // as a seeding failure always has.
  try {
    await seedConnection(owner);
    // 2. Register the owner (first launch with a registry).
    await ensureOwnerProfile(await legacyOwnerName());
    // 3–4. Open the launch profile when it isn't the owner.
    const id = await launchProfileId();
    if (id !== OWNER_ID) await enterProfile(id);
    return { ready: true, error: null };
  } catch (e) {
    return { ready: true, error: asError(e) };
  }
}

// Once per app run, however often the hook mounts (StrictMode runs effects twice).
let launched: Promise<Outcome> | null = null;

export function useLocalDbBootstrap(): { ready: boolean; error: Error | null } {
  const [outcome, setOutcome] = useState<Outcome>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    launched ??= launch();
    void launched.then((o) => {
      if (!cancelled) setOutcome(o);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return outcome;
}
