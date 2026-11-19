/**
 * When a workout the Watch asked for really began.
 *
 * A Wear OS watch out of reach queues its start, and the phone may only hear
 * it many minutes later. Starting the workout on arrival would shift it (and
 * the heart rate the watch measured from the tap) to the wrong time, so the
 * Watch sends the moment it was tapped. An Apple Watch, or an older Wear
 * build, sends none and the phone starts now.
 *
 * A time from the future is a watch clock out of step, and one older than the
 * limit is not a start worth backdating to; both start now.
 *
 * No imports and no native calls, so it runs under `npm test`.
 */

export const MAX_WATCH_START_AGE_MS = 6 * 60 * 60 * 1000;

export function watchStartTime(action: Record<string, unknown>, now: number): number | undefined {
  const t = action.startedAt;
  if (typeof t !== 'number' || !Number.isSafeInteger(t) || t < 0) return undefined;
  if (t > now || now - t > MAX_WATCH_START_AGE_MS) return undefined;
  return t;
}
