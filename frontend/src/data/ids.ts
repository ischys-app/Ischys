/**
 * Local-repo id + clock helpers for the pure on-device app (no server).
 * `nowMs` is a monotonic wall clock — never returns a value <= the previous one
 * within a session — so an `updated_at` written twice in the same millisecond
 * still orders deterministically.
 */
export { newId } from '../db/ids';

/** The single on-device user. User-owned rows carry it; catalog rows have null. */
export const LOCAL_USER_ID = 'local';

let lastMs = 0;
export function nowMs(): number {
  const t = Date.now();
  lastMs = t > lastMs ? t : lastMs + 1;
  return lastMs;
}
