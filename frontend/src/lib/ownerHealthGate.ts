/**
 * Health and the Watch are the phone owner's only (#117), with one exception:
 * an owner's finish sync still running when the phone switches to someone
 * else's profile. It waits on the Watch's "saved" confirmation and on a Wear
 * OS watch's measurements, and must still hear them, or the phone writes a
 * second Health entry and loses the heart rate. Switching is not blocked or
 * delayed for it; what the sync writes goes to the owner's file (`deviceDb`).
 *
 * Pure, so `node --test` covers it (ownerHealthGate.test.ts).
 */

/** Counts jobs in flight. `run` holds one for the length of `job`, even if it throws. */
export function createInFlight() {
  let count = 0;
  return {
    async run<T>(job: () => Promise<T>): Promise<T> {
      count++;
      try {
        return await job();
      } finally {
        count--;
      }
    },
    pending(): boolean {
      return count > 0;
    },
  };
}

/**
 * Whether a Watch message about a workout (a save confirmation, a Wear
 * session's measurements) is taken in: while the owner is active, or while an
 * owner's finish is still waiting on it.
 */
export function acceptsWatchMessage(ownerActive: boolean, ownerFinishPending: boolean): boolean {
  return ownerActive || ownerFinishPending;
}
