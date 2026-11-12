/**
 * Ids for sets created on the workout screen (+ Add Set, swaps). The screen
 * renders the row under this id and the store inserts it under the same one, so
 * it must be as unique as any stored id. It used to be a counter that restarted
 * at 0 on every launch: after a relaunch, + Add Set reused ids already stored in
 * earlier workouts, the insert failed on the UNIQUE id, and the row flashed and
 * vanished until enough taps had moved the counter past them (#158).
 */
import { newId } from '../../db/ids.ts';

export function newSetId(): string {
  return newId();
}
