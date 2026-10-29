/**
 * Runs the Keychain migration (lib/keychainMigration.ts) on iOS.
 *
 * A launch in the foreground runs it before the UI shows: about twenty
 * Keychain calls, and nothing reads a half-moved setting. A launch in the
 * background (woken by the Watch, maybe with the phone locked) waits until the
 * user opens the app; until then the app's calls are kept out of its way by
 * the migrating store. A run that finds the Keychain locked tries again the
 * next time the app is opened.
 *
 * Until it has run once, a Watch finish with the phone locked can still fail
 * on settings stored before the update.
 */
import { AppState, Platform } from 'react-native';

import { listProfiles } from '../data/profilesRepo';
import { OWNER_ID } from '../domain/profiles';
import {
  createMigrationScheduler,
  keychainKeysToMigrate,
  withTimeout,
  type KeychainMigration,
} from './keychainMigration';
import { migrateKeychainItems } from './secureStore';

/** The longest a foreground launch waits for the migration. */
const LAUNCH_WAIT_MS = 2000;

async function runOnce(): Promise<KeychainMigration> {
  // Every profile's keys. The registry is read now, so a profile added while
  // this waited is covered; one that can't be read leaves it for next time.
  const ids = (await listProfiles()).map((p) => p.id);
  if (!ids.includes(OWNER_ID)) ids.unshift(OWNER_ID);
  return migrateKeychainItems(keychainKeysToMigrate(ids), (message) => {
    if (__DEV__) console.warn(message);
  });
}

const scheduler = createMigrationScheduler(
  {
    current: () => AppState.currentState,
    subscribe: (listener) => {
      const sub = AppState.addEventListener('change', listener);
      return () => sub.remove();
    },
  },
  runOnce,
);

/**
 * Starts the migration. Resolves when it has run, or after LAUNCH_WAIT_MS, if
 * the app is in the foreground now; at once otherwise. Never rejects.
 */
export async function migrateKeychain(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const run = scheduler.start();
  if (!run) return;
  // Never longer than this: past it, launch goes on and the run finishes behind it.
  await withTimeout(run, LAUNCH_WAIT_MS).catch(() => {});
}
