/**
 * Whether warmup sets count toward volume (and the best_volume PR).
 *
 * By default warmups contribute 0 — they're preparation, not working volume. A
 * user who wants them counted flips this on. Kept in SecureStore as a single
 * flag, mirroring `lib/bodyweight.ts`.
 *
 * As with bodyweight, this is resolved BEFORE any expo-sqlite transaction and
 * threaded down as a boolean — awaiting SecureStore inside a transaction hangs
 * it (see recordStore.ts). Never call `getCountWarmups()` from inside a
 * `db.transaction` or from `recomputeForExercise`.
 */
import * as SecureStore from './secureStore';

import { profileKey } from './activeProfile';

const KEY = 'ischys.countWarmupsInVolume';

/** True when warmups should count toward volume; false (default) when they don't. */
export async function getCountWarmups(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(profileKey(KEY));
  return raw === '1';
}

/** Persist the warmups-in-volume flag. */
export async function setCountWarmups(v: boolean): Promise<void> {
  if (v) {
    await SecureStore.setItemAsync(profileKey(KEY), '1');
  } else {
    await SecureStore.deleteItemAsync(profileKey(KEY));
  }
}
