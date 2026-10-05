/**
 * Where each unit's bar setup is kept, separated from SecureStore so
 * `node --test` can drive it with a fake. `lib/plateSetup.ts` binds the real
 * store.
 *
 * One slot per unit. A lifter who switches to pounds has not sold their kg
 * plates: the kg setup stays where it is and comes back untouched when they
 * switch again. Kilograms keep the key they had before pounds existed, so a
 * setup saved by an older version is simply the kg setup — nothing is migrated,
 * rewritten or re-read under a new name.
 */
import { defaultBarSetup, parseBarSetup, setupUnit, type BarSetup } from '../domain/plateMath.ts';
import type { Unit } from '../domain/units.ts';

/** The two SecureStore calls this needs. */
export type KeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
};

const KEYS: Record<Unit, string> = {
  kg: 'ischys.plateSetup',
  lb: 'ischys.plateSetup.lb',
};

export function plateSetupKey(unit: Unit): string {
  return KEYS[unit];
}

/** The setup stored for `unit`, or that unit's standard set. Never throws. */
export async function readPlateSetup(store: KeyValueStore, unit: Unit): Promise<BarSetup> {
  try {
    return parseBarSetup(await store.getItemAsync(plateSetupKey(unit)), unit);
  } catch {
    return defaultBarSetup(unit);
  }
}

/**
 * Persist a setup in the slot for ITS unit — the caller cannot file a pound
 * rack under kilograms by passing the wrong unit, because it doesn't pass one.
 * Storage being unavailable costs the edit, not the app.
 */
export async function writePlateSetup(store: KeyValueStore, setup: BarSetup): Promise<void> {
  try {
    await store.setItemAsync(plateSetupKey(setupUnit(setup)), JSON.stringify(setup));
  } catch {
    // as above
  }
}
