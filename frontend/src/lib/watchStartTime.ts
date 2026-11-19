/**
 * When a workout the Watch asked for really began.
 *
 * A Wear OS watch out of reach queues its start, and the phone may only hear
 * it many minutes later. Starting the workout on arrival would shift it (and
 * the heart rate the watch measured from the tap) to the wrong time, so the
 * Watch sends the moment it was tapped. An Apple Watch, or an older Wear
 * build, sends none and the phone starts now.
 *
 * A start under a minute old starts now, so a watch clock a little out of
 * step never shifts an ordinary in-reach start. A time from the future is a
 * clock out of step too, and one older than the limit is not a start worth
 * backdating to; all of these start now.
 *
 * No imports and no native calls, so it runs under `npm test`.
 */

export const MAX_WATCH_START_AGE_MS = 6 * 60 * 60 * 1000;
/** Younger than this, the phone's own clock is the better start. */
export const MIN_WATCH_START_AGE_MS = 60 * 1000;

export function watchStartTime(action: Record<string, unknown>, now: number): number | undefined {
  const t = action.startedAt;
  if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 0) return undefined;
  const age = now - t;
  if (age < MIN_WATCH_START_AGE_MS || age > MAX_WATCH_START_AGE_MS) return undefined;
  return t;
}
