/**
 * The workout's two clocks, derived from absolute timestamps.
 *
 * A `setInterval` that increments a counter stops the moment iOS suspends the
 * app, so it silently loses however long the user was away — which is most of a
 * real workout, and why the app's clocks used to disagree with the Live
 * Activity's (which renders from `Date`s and cannot drift).
 *
 * Pure — no imports, so `node --test` can run it. See clocks.test.ts.
 */

/** Whole seconds since the workout began. Never negative. */
export function elapsedSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

/**
 * Whole seconds of rest left. Rounds up, so a rest with 200ms remaining still
 * reads "1" rather than flashing 0 while the Live Activity still shows 0:01.
 */
export function restRemainingSeconds(restEndsAt: number, now: number): number {
  return Math.max(0, Math.ceil((restEndsAt - now) / 1000));
}
