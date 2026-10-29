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
import { OWNER_ID, parseActiveWorkout, resolveLaunchProfile, type ProfileRow } from '../domain/profiles';
import { DEFAULT_NAME, setActiveProfile } from '../lib/activeProfile';
import { setEffortMode } from '../lib/effortMode';
import { setHapticsEnabled } from '../lib/haptics';
import { setWeightUnit } from '../lib/weightUnit';
import { getSettings } from '../data/settingsRepo';

/** The owner's name from before profiles existed (profileName.ts's old key). */
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
 * at `conn` while they run. On success `stay` leaves it there (launch, which
 * must not hand `db` back to the owner between seeding a profile and entering
 * it); otherwise, and always on failure, `db` goes back to where it was.
 */
async function seedConnection(conn: ProfileConnection, stay: boolean): Promise<void> {
  const previous = currentConnection();
  useConnection(conn);
  let seeded = false;
  try {
    await seedCatalog(catalog as Catalog);
    await ensureLocalSettings(conn);
    // Fold import-created name duplicates into their catalog original. Best
    // effort — never let a dedup hiccup keep the app from starting.
    await dedupeExercisesByName().catch(() => 0);
    seeded = true;
  } finally {
    if (!seeded || !stay) useConnection(previous);
  }
}

/**
 * Migrates a profile's file, then seeds it. Every profile file goes through
 * this before `db` is pointed at it. `db` is back where it was afterwards. Don't
 * call it while an `atomically` transaction is open: `db` moves to `conn` while
 * the seeding runs.
 */
export async function prepareConnection(conn: ProfileConnection): Promise<void> {
  await runMigrations(conn);
  await seedConnection(conn, false);
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
function launchProfileId(rows: readonly ProfileRow[]): string {
  const registryIds = rows.map((p) => p.id);
  return resolveLaunchProfile({
    registryIds,
    lastUsedId: readSecure(ACTIVE_PROFILE_KEY),
    activeWorkoutProfileId: parseActiveWorkout(readSecure(ACTIVE_WORKOUT_KEY))?.profileId ?? null,
  });
}

/**
 * Opens, prepares and switches to a non-owner profile. `db` moves to it when
 * its seeding starts and stays there, never back on the owner in between. On
 * failure `db` is back on the owner and the file is closed.
 */
async function enterProfile(id: string): Promise<void> {
  const conn = openConnection(id);
  try {
    await runMigrations(conn);
    await seedConnection(conn, true);
  } catch (e) {
    closeConnection(conn);
    throw e;
  }
}

/**
 * Primes the caches that screens read before any settings screen mounts, so the
 * first paint already has them: the haptic preference (screens fire haptics
 * before the workout or settings screen would sync it), the weight unit (the
 * first screen to show a weight should know it, rather than paint kilograms and
 * correct itself) and whether sets are rated (off by default, so priming it late
 * can only ever add a rating to the screen, never flash one that is hidden).
 * Failing leaves today's defaults; it never blocks launch.
 */
async function primeSettings(): Promise<void> {
  try {
    const s = await getSettings();
    setHapticsEnabled(s.haptic_feedback);
    setWeightUnit(s.unit);
    setEffortMode(s.effort_mode);
  } catch {
    // keep the defaults
  }
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
    await seedConnection(owner, true);
    // 2. Register the owner (first launch with a registry).
    await ensureOwnerProfile(await legacyOwnerName());
    // 3–4. Open the launch profile when it isn't the owner. If its file won't
    // open, launch on the owner instead, and report it. The running-workout
    // pointer is left alone: it still names that profile's workout, and the
    // owner doesn't try to open it (activeWorkout.ts).
    const rows = await listProfiles();
    const id = launchProfileId(rows);
    let launchId = OWNER_ID;
    let error: Error | null = null;
    if (id !== OWNER_ID) {
      try {
        await enterProfile(id);
        launchId = id;
      } catch (e) {
        error = asError(e);
      }
    }
    // 5. Who is using the app, for the per-profile keys and the name.
    const launchRow = rows.find((p) => p.id === launchId);
    if (launchRow) setActiveProfile(launchRow, rows.length);
    await primeSettings();
    return { ready: true, error };
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
