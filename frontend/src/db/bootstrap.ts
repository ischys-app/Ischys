/**
 * Launch: migrates and seeds the owner's `ischys.db`, registers the owner in
 * the profiles registry, then opens the profile the app should launch into
 * (#117). `ready` gates the UI until this completes.
 */
import * as SecureStore from '../lib/secureStore';
import { useEffect, useState } from 'react';

import catalog from '../../assets/catalog/catalog.json';
import * as schema from './schema';
import type { Catalog } from './catalog/catalogTypes';
import { seedCatalog } from './catalog/seedCatalog';
import { migrateConnection } from './migrateConnection';
import {
  closeConnection,
  openConnection,
  useConnection,
  type ProfileConnection,
} from './client';
import { dedupeExercisesByName } from '../data/exercisesRepo';
import { ensureOwnerProfile, listProfiles } from '../data/profilesRepo';
import { OWNER_ID, parseActiveWorkout, resolveLaunchProfile, type ProfileRow } from '../domain/profiles';
import { DEFAULT_NAME, setActiveProfile } from '../lib/activeProfile';
import { migrateKeychain } from '../lib/migrateKeychain';
import { setEffortMode } from '../lib/effortMode';
import { setHapticsEnabled } from '../lib/haptics';
import { setWeightUnit } from '../lib/weightUnit';
import { getSettings } from '../data/settingsRepo';
import type { SettingsOut } from '../api/types';

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

/** Runs the file's pending migrations (db/migrateConnection.ts). */
function runMigrations(conn: ProfileConnection): Promise<void> {
  return migrateConnection(conn);
}

/**
 * Seeds the catalog and the settings row in an already-migrated file. Works on
 * `conn` alone: `db` stays where it is (Ruling R9).
 */
async function seedConnection(conn: ProfileConnection): Promise<void> {
  await seedCatalog(catalog as Catalog, conn);
  await ensureLocalSettings(conn);
}

/**
 * Migrates a profile's file, then seeds it. Every profile file goes through
 * this before `db` is pointed at it, and it never moves `db`: a switch runs it
 * while the previous profile is still the current one.
 */
export async function prepareConnection(conn: ProfileConnection): Promise<void> {
  await runMigrations(conn);
  await seedConnection(conn);
}

/**
 * Folds import-created name duplicates into their catalog original, in the
 * current file. Runs once the profile is active, not while preparing: a merge
 * recomputes records with the profile's bodyweight and warm-up setting (keyed
 * per profile) and commits on the current connection's queue. Best effort: a
 * dedup hiccup never keeps the app from starting or a switch from finishing.
 */
export async function tidyCurrentConnection(): Promise<void> {
  await dedupeExercisesByName().catch(() => 0);
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
 * Opens and prepares a non-owner profile's file. `db` stays on the owner until
 * launch points it here, once. On failure the file is closed.
 */
async function openPrepared(id: string): Promise<ProfileConnection> {
  const conn = openConnection(id);
  try {
    await prepareConnection(conn);
    return conn;
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
  applySettings(await readSettings());
}

/**
 * The settings a profile's file holds (its own half from `conn`, the device's
 * from the owner's file), or null when they can't be read. Reads `conn`
 * directly, so a switch can read the target's before `db` moves to it.
 */
export async function readSettings(conn?: ProfileConnection): Promise<SettingsOut | null> {
  try {
    return await getSettings(conn?.drizzle);
  } catch {
    return null;
  }
}

/** Puts read settings into the caches, synchronously. Null keeps what they hold. */
export function applySettings(s: SettingsOut | null): void {
  if (!s) return;
  setHapticsEnabled(s.haptic_feedback);
  setWeightUnit(s.unit);
  setEffortMode(s.effort_mode);
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
  let outcome: Outcome;
  try {
    // `db` is the owner's already (db/client.ts).
    await seedConnection(owner);
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
        useConnection(await openPrepared(id));
        launchId = id;
      } catch (e) {
        error = asError(e);
      }
    }
    // 5. Who is using the app, for the per-profile keys and the name.
    const launchRow = rows.find((p) => p.id === launchId);
    if (launchRow) setActiveProfile(launchRow, rows.length);
    await tidyCurrentConnection();
    await primeSettings();
    outcome = { ready: true, error };
  } catch (e) {
    outcome = { ready: true, error: asError(e) };
  }
  // 6. Settings stored before they were readable locked are stored again,
  // once. Whatever the steps above reached: it needs only the registry. Waited
  // for in the foreground (a few Keychain calls, at most 2 s), deferred in the
  // background.
  await migrateKeychain();
  return outcome;
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
