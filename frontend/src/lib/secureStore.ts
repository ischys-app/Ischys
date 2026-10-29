/**
 * The app's one way into expo-secure-store. Import this, never the package.
 *
 * Every value is written AFTER_FIRST_UNLOCK. The package's default,
 * WHEN_UNLOCKED, makes the iOS Keychain refuse every read and write while the
 * phone is locked (errSecInteractionNotAllowed), and the app does real work
 * locked: the Watch's Finish, Live Activity buttons and the rest timer all
 * reach code that reads these settings. Finishing from the Watch with the
 * phone in a pocket failed on the bodyweight read.
 *
 * AFTER_FIRST_UNLOCK is still encrypted at rest and unreadable until the phone
 * has been unlocked once since it started; it is what iOS gives an app's own
 * files by default. Android ignores the option.
 *
 * Writing over an existing item keeps the accessibility it was created with
 * (expo updates it in place), so items stored before this module existed are
 * re-created once by keychainMigration.ts. Every call goes through it, so the
 * app never sees an item in the moment between its delete and its store.
 *
 * Reads and deletes take no accessibility: the Keychain finds an item whatever
 * its class.
 */
import * as Native from 'expo-secure-store';

import { createMigratingStore } from './keychainMigration';

const WRITE: Native.SecureStoreOptions = { keychainAccessible: Native.AFTER_FIRST_UNLOCK };

const store = createMigratingStore({
  getItem: (key) => Native.getItem(key),
  getItemAsync: (key) => Native.getItemAsync(key),
  setItem: (key, value) => Native.setItem(key, value, WRITE),
  setItemAsync: (key, value) => Native.setItemAsync(key, value, WRITE),
  deleteItemAsync: (key) => Native.deleteItemAsync(key),
});

export const getItem = store.getItem;
export const getItemAsync = store.getItemAsync;
export const setItem = store.setItem;
export const setItemAsync = store.setItemAsync;
export const deleteItemAsync = store.deleteItemAsync;

/** Re-creates the stored items in `keys` (lib/migrateKeychain.ts runs it). */
export const migrateKeychainItems = store.migrate;
