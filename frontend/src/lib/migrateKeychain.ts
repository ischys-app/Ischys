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
import { createMigrationScheduler, keychainKeysToMigrate, type KeychainMigration } from './keychainMigration';
import { migrateKeychainItems } from './secureStore';

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
 * Starts the migration. Resolves when it has run, if the app is in the
 * foreground now; at once otherwise. Never rejects.
 */
export async function migrateKeychain(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await scheduler.start()?.catch(() => {});
}
