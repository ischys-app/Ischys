/**
 * Re-creates the SecureStore items stored before lib/secureStore.ts wrote
 * AFTER_FIRST_UNLOCK, so they too can be read while the phone is locked.
 *
 * Writing over an item keeps the accessibility it was created with (expo
 * updates it in place), so each one is deleted and stored again. Once per
 * install: a marker records it. iOS only; Android has no such setting.
 *
 * The delete opens a gap in which the item is not there, and the app may be
 * reading and writing the same keys at the time (the rest timer, the running
 * workout). So the app's SecureStore goes through `createMigratingStore`,
 * which keeps the app out of that gap:
 *  - its async calls wait until the migration is over, and the migration
 *    waits for the async calls already under way before it starts;
 *  - its sync reads of a key being re-created get the value being re-created;
 *  - its sync writes during the migration are what is stored in the end.
 *
 * Pure (the native store is handed in), so it is node-tested.
 */
import { PROFILE_SCOPED_KEYS, scopedKey } from '../domain/profiles.ts';
import type { AppStateSource } from './activeGate.ts';

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

/** SecureStore itself. Its writes create items AFTER_FIRST_UNLOCK. */
export type NativeStore = {
  getItem(key: string): string | null;
  getItemAsync(key: string): Promise<string | null>;
  setItem(key: string, value: string): void;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type KeychainMigration =
  /** Done on an earlier launch. */
  | { outcome: 'already' }
  /** A read was refused (the phone is locked): stopped, to try again. */
  | { outcome: 'locked' }
  /**
   * Ran: how many items were re-created, and any whose value could not be
   * stored again. `marked` is false when something was left undone, so that it
   * runs again next time.
   */
  | { outcome: 'done'; moved: number; lost: string[]; marked: boolean };

export type MigratingStore = NativeStore & {
  /** Re-creates every stored item in `keys`. One at a time; a second call while one runs gets the same run. */
  migrate(keys: readonly string[], warn?: (message: string) => void): Promise<KeychainMigration>;
};

export function createMigratingStore(native: NativeStore): MigratingStore {
  /** Settles when the migration under way is over. */
  let running: Promise<KeychainMigration> | null = null;
  /** App async calls under way, which the migration lets finish first. */
  const underWay = new Set<Promise<unknown>>();
  /** Keys between their delete and their store, with the value they will get. */
  const inGap = new Map<string, string>();
  /** The app's sync writes since the migration started, latest per key. */
  const appWrites = new Map<string, string>();

  /** Runs an app async call once no migration is running, and keeps track of it. */
  function appCall<T>(call: () => Promise<T>): Promise<T> {
    const go = async (): Promise<T> => {
      while (running) await running.catch(() => {});
      return call();
    };
    const p = go();
    underWay.add(p);
    const forget = () => underWay.delete(p);
    p.then(forget, forget);
    return p;
  }

  async function run(keys: readonly string[], warn: (message: string) => void): Promise<KeychainMigration> {
    // Calls the app started before this did may still be landing.
    await Promise.allSettled([...underWay]);

    try {
      if ((await native.getItemAsync(KEYCHAIN_MIGRATION_MARKER)) === '1') return { outcome: 'already' };
    } catch {
      return { outcome: 'locked' };
    }

    let moved = 0;
    let complete = true;
    const lost: string[] = [];
    for (const key of keys) {
      appWrites.delete(key);
      let value: string | null;
      try {
        value = await native.getItemAsync(key);
      } catch {
        return { outcome: 'locked' };
      }
      // A sync write that landed while the read was out wins.
      value = appWrites.get(key) ?? value;
      if (value == null) continue;

      inGap.set(key, value);
      try {
        await native.deleteItemAsync(key);
      } catch {
        // Still there, unchanged unless the app wrote it, which keeps it current.
        inGap.delete(key);
        complete = false;
        continue;
      }
      // The value now: the one read, or the app's latest write since.
      const next = inGap.get(key) ?? value;
      inGap.delete(key);
      if (storeTwice(native, key, next)) {
        moved += 1;
      } else {
        lost.push(key);
        complete = false;
        warn(`[keychain] could not store ${key} again after re-creating it; its value is lost`);
      }
    }

    let marked = false;
    if (complete) {
      try {
        native.setItem(KEYCHAIN_MIGRATION_MARKER, '1');
        marked = true;
      } catch {
        // Runs again next time, harmlessly.
      }
    }
    return { outcome: 'done', moved, lost, marked };
  }

  return {
    getItem(key) {
      const gap = inGap.get(key);
      return gap !== undefined ? gap : native.getItem(key);
    },
    setItem(key, value) {
      native.setItem(key, value);
      if (running) {
        appWrites.set(key, value);
        if (inGap.has(key)) inGap.set(key, value);
      }
    },
    getItemAsync: (key) => appCall(() => native.getItemAsync(key)),
    setItemAsync: (key, value) => appCall(() => native.setItemAsync(key, value)),
    deleteItemAsync: (key) => appCall(() => native.deleteItemAsync(key)),
    migrate(keys, warn = () => {}) {
      if (running) return running;
      const p = run(keys, warn).finally(() => {
        running = null;
        appWrites.clear();
        inGap.clear();
      });
      running = p;
      return p;
    },
  };
}

function storeTwice(native: NativeStore, key: string, value: string): boolean {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      native.setItem(key, value);
      return true;
    } catch {
      // Once more.
    }
  }
  return false;
}

/**
 * When to run the migration: at once if the app is active, else on its next
 * change to active (a launch in the background, woken by the Watch, may be
 * with the phone locked). A run that finds the Keychain locked, that fails, or
 * that leaves something undone tries again on the next change to active, never
 * while still active.
 *
 * `start()` returns the run when it starts one now, so a foreground launch
 * can wait for it; null when it waits, or has already started.
 */
export function createMigrationScheduler(
  app: AppStateSource,
  run: () => Promise<KeychainMigration>,
): { start(): Promise<KeychainMigration> | null } {
  let started = false;

  const attempt = async (): Promise<KeychainMigration> => {
    let result: KeychainMigration;
    try {
      result = await run();
    } catch {
      result = { outcome: 'locked' };
    }
    // Locked, or ran with something left undone: again on the next open.
    if (result.outcome === 'locked' || (result.outcome === 'done' && !result.marked)) onNextActive();
    return result;
  };

  const onNextActive = () => {
    const off = app.subscribe((state) => {
      if (state !== 'active') return;
      off();
      void attempt();
    });
  };

  return {
    start() {
      if (started) return null;
      started = true;
      if (app.current() === 'active') return attempt();
      onNextActive();
      return null;
    },
  };
}

/**
 * `run`, or 'timeout' once `ms` have passed without it settling. The run is
 * not stopped: it carries on, and keeps the app's calls out of its way, as
 * before. Launch waits on this so a Keychain call that never answers cannot
 * hold the splash screen.
 */
export function withTimeout<T>(
  run: Promise<T>,
  ms: number,
  timer: (fn: () => void, ms: number) => unknown = setTimeout,
): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    let settled = false;
    timer(() => {
      if (settled) return;
      settled = true;
      resolve('timeout');
    }, ms);
    run.then(
      (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      },
    );
  });
}
