/**
 * Parsing the timestamps the data layer surfaces.
 *
 * The on-device store persists instants as epoch-ms (UTC), but the DTOs expose
 * them as ISO strings, and some carry no offset — `2026-07-11T05:00:00`, no `Z`.
 *
 * ECMAScript parses an offset-less date-time as *local* time, so every clock
 * built on it was wrong by the device's UTC offset: a workout started a minute
 * ago read as three hours old in Athens.
 *
 * This treats an offset-less timestamp as UTC — the instant it actually
 * denotes — and leaves an explicit `Z` or `±hh:mm` alone.
 *
 * Pure — no imports, so `node --test` can run it. See serverTime.test.ts.
 */

/** Ends with `Z`, `+hh:mm`, `-hh:mm`, `+hhmm` or `-hhmm`. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Epoch milliseconds, or `NaN` if unparseable. */
export function parseServerDate(iso: string): number {
  if (!iso) return NaN;
  return Date.parse(HAS_OFFSET.test(iso) ? iso : `${iso}Z`);
}

/** Whole seconds since `iso`, clamped at >= 0. */
export function secondsSince(iso: string, now: number = Date.now()): number {
  const started = parseServerDate(iso);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / 1000));
}
