/**
 * Runs lib/keychainMigration.ts once launch is done, on iOS.
 *
 * Only in the foreground: the app can launch in the background, woken by the
 * Watch with the phone locked, when the old items can't be read. Then it
 * waits until the user opens the app, which means the phone is unlocked. A
 * read refused anyway stops it, unmarked, until the next launch.
 */
import { Platform } from 'react-native';

import * as SecureStore from './secureStore';
import { keychainKeysToMigrate, migrateKeychain } from './keychainMigration';
import { whenActive } from './whenActive';

let started = false;

/** Best effort and never awaited: launch does not wait on the Keychain. */
export function migrateKeychainWhenActive(profileIds: readonly string[]): void {
  if (Platform.OS !== 'ios' || started) return;
  started = true;
  whenActive(() => {
    void migrateKeychain(SecureStore, keychainKeysToMigrate(profileIds), (message) => {
      if (__DEV__) console.warn(message);
    }).catch(() => {
      // Nothing it does throws; should something, the items stay as they were.
    });
  });
}
