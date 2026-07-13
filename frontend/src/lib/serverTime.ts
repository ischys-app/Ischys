/**
 * Parsing timestamps the API sends.
 *
 * The backend stores UTC (`datetime.now(timezone.utc)`), but the column is
 * backed by SQLite, which does not keep the offset. Pydantic then serialises a
 * NAIVE string — `2026-07-11T05:00:00`, no `Z`.
 *
 * ECMAScript parses a date-time with no offset as *local* time, so every clock
 * built on it was wrong by the device's UTC offset: a workout started a minute
 * ago read as three hours old in Athens.
 *
 * This treats an offset-less timestamp as UTC, which is what the server meant,
 * and leaves an explicit `Z` or `±hh:mm` alone — so it keeps working if the
 * backend is ever fixed to serialise the offset.
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
