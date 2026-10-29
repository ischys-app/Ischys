/**
 * Re-creates the SecureStore items stored before lib/secureStore.ts wrote
 * AFTER_FIRST_UNLOCK, so they too can be read while the phone is locked.
 *
 * Writing over an item keeps the accessibility it was created with (expo
 * updates it in place), so each one is deleted and stored again. Once per
 * install: a marker records it. iOS only; Android has no such setting.
 *
 * Pure (the store is handed in), so it is node-tested; lib/migrateKeychain.ts
 * runs it.
 */
import { PROFILE_SCOPED_KEYS, scopedKey } from '../domain/profiles.ts';

/** Set once every item has been re-created. */
export const KEYCHAIN_MIGRATION_MARKER = 'ischys.keychainAfterFirstUnlock';

/**
 * Every key stored once per phone, whoever is using it. The per-person ones
 * are PROFILE_SCOPED_KEYS, stored once per profile (domain/profiles.ts).
 *
 * Not here: `ischys.exerciseDemo.<exercise id>`, a copy of a column only the
 * exercise screen reads, in the foreground. It is written AFTER_FIRST_UNLOCK
 * from now on and simply stays as it is until then.
 */
export const DEVICE_KEYS: readonly string[] = [
  'ischys.activeProfileId',
  'ischys.activeWorkoutId',
  'ischys.restSession',
  'ischys.liveActivityDisabledHintShown',
  'ischys.themeId',
  'ischys.chartRange',
  'ischys.exactAlarmAsked',
  'ischys.reviewWorkoutCount',
  'ischys.reviewLastWorkoutId',
  'ischys.reviewAskedAt',
  'ischys.profile.name',
  'ischys.healthConnected',
  'ischys.healthLastSync',
  'ischys.healthWorkoutsWritten',
  'ischys.healthPref.writeWorkouts',
  'ischys.healthPref.readHR',
  'ischys.healthPref.readBody',
  'ischys.healthPref.readEnergy',
  'ischys.healthRecv.readHR',
  'ischys.healthRecv.readEnergy',
  'ischys.healthRecv.readBody',
  'ischys.healthWrite.status',
];

/** The keys to re-create: the phone's, then each profile's own. No repeats. */
export function keychainKeysToMigrate(profileIds: readonly string[]): string[] {
  const keys = new Set<string>(DEVICE_KEYS);
  for (const id of profileIds) {
    for (const key of PROFILE_SCOPED_KEYS) keys.add(scopedKey(id, key));
  }
  return [...keys];
}

/** What the migration needs of SecureStore. `setItem` writes AFTER_FIRST_UNLOCK. */
export type KeychainStore = {
  getItemAsync(key: string): Promise<string | null>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItemAsync(key: string): Promise<void>;
};

export type KeychainMigration =
  /** Done on an earlier launch. */
  | { outcome: 'already' }
  /** A read was refused (the phone is locked): stopped, to try next time. */
  | { outcome: 'locked' }
  /** Ran: how many items were re-created, and any whose value could not be stored again. */
  | { outcome: 'done'; moved: number; lost: string[] };

/**
 * Re-creates every stored item in `keys`, then sets the marker.
 *
 * A refused read stops it before anything else is touched, without the marker,
 * so it runs again next launch: re-creating an item twice changes nothing.
 * After the delete, the store again is synchronous, so nothing can land
 * between checking the key is still empty and storing the value. A value
 * written since the read was stored fresh, with the new accessibility, and is
 * kept. A store that fails is tried once more; one that fails again is
 * reported through `warn` and in `lost`.
 */
export async function migrateKeychain(
  store: KeychainStore,
  keys: readonly string[],
  warn: (message: string) => void = () => {},
): Promise<KeychainMigration> {
  try {
    if ((await store.getItemAsync(KEYCHAIN_MIGRATION_MARKER)) === '1') return { outcome: 'already' };
  } catch {
    return { outcome: 'locked' };
  }

  let moved = 0;
  const lost: string[] = [];
  for (const key of keys) {
    let value: string | null;
    try {
      value = await store.getItemAsync(key);
    } catch {
      return { outcome: 'locked' };
    }
    if (value == null) continue;

    try {
      await store.deleteItemAsync(key);
    } catch {
      continue; // Still there as it was: readable unlocked, as before.
    }

    // From here to the store, nothing awaits.
    let since: string | null = null;
    try {
      since = store.getItem(key);
    } catch {
      // Unreadable now means nothing was written since; store it back.
    }
    if (since != null) continue;
    if (storeTwice(store, key, value)) {
      moved += 1;
    } else {
      lost.push(key);
      warn(`[keychain] could not store ${key} again after re-creating it; its value is lost`);
    }
  }

  try {
    store.setItem(KEYCHAIN_MIGRATION_MARKER, '1');
  } catch {
    // Runs again next launch, harmlessly.
  }
  return { outcome: 'done', moved, lost };
}

function storeTwice(store: KeychainStore, key: string, value: string): boolean {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      store.setItem(key, value);
      return true;
    } catch {
      // Once more.
    }
  }
  return false;
}
