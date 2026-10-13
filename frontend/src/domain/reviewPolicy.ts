/**
 * When to ask iOS for the App Store review prompt.
 *
 * The first ask comes after a few finished workouts. After that the app may ask
 * again, but rarely: only on a newer version, and only once enough time and
 * enough training have passed that the person has something new to rate. iOS
 * itself shows the real prompt a handful of times a year at most and may show
 * nothing at all, so a single ask is easily wasted.
 *
 * Pure: the caller supplies the counters, the clock and the app version.
 */

/** Finished workouts before the first ask. */
export const FIRST_ASK_AT = 3;
/** Finished workouts that must follow an ask before the next one. */
export const REASK_MIN_WORKOUTS = 10;
/** Days that must follow an ask before the next one. */
export const REASK_MIN_DAYS = 90;

const DAY_MS = 86400000;

export type ReviewAskState = {
  /** Finished workouts so far, including the one just finished. */
  count: number;
  /** Epoch ms of the last ask, null when the app has never asked. */
  askedAt: number | null;
  /** `count` at the last ask. Null on installs that asked before this was recorded. */
  askedCount: number | null;
  /** App version at the last ask. Null on installs that asked before this was recorded. */
  askedVersion: string | null;
  /** The running app's version, '' when it cannot be read. */
  appVersion: string;
  now: number;
};

export function shouldAskForReview(s: ReviewAskState): boolean {
  if (s.askedAt === null) return s.count >= FIRST_ASK_AT;

  // Without a version there is no telling a new release from the one already asked on.
  if (!s.appVersion || s.appVersion === (s.askedVersion ?? '')) return false;
  if (s.now - s.askedAt < REASK_MIN_DAYS * DAY_MS) return false;
  return s.count - (s.askedCount ?? FIRST_ASK_AT) >= REASK_MIN_WORKOUTS;
}
