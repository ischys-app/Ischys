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

/**
 * Whether the rest a render saw has run out, and is still the rest under way.
 *
 * The clean-up after a rest runs a moment after the render that showed 0. A
 * set ticked in that moment starts a new rest, and the clean-up, still holding
 * the old end, wiped the new one's: the card stuck on the full rest, no longer
 * counting. `liveEndsAt` is the end as it is now, so a rest that has been
 * replaced or moved since is left alone.
 */
export function restRanOut(remaining: number, endsAt: number | null, liveEndsAt: number | null): boolean {
  return remaining === 0 && endsAt != null && endsAt === liveEndsAt;
}
