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
 * re-created once by keychainMigration.ts.
 *
 * Reads and deletes take no accessibility: the Keychain finds an item whatever
 * its class.
 */
import * as Native from 'expo-secure-store';

const WRITE: Native.SecureStoreOptions = { keychainAccessible: Native.AFTER_FIRST_UNLOCK };

export function getItem(key: string): string | null {
  return Native.getItem(key);
}

export function getItemAsync(key: string): Promise<string | null> {
  return Native.getItemAsync(key);
}

export function setItem(key: string, value: string): void {
  Native.setItem(key, value, WRITE);
}

export function setItemAsync(key: string, value: string): Promise<void> {
  return Native.setItemAsync(key, value, WRITE);
}

export function deleteItemAsync(key: string): Promise<void> {
  return Native.deleteItemAsync(key);
}
