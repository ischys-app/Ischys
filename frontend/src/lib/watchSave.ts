/**
 * The record of the Watch confirming it saved a session to Apple Health, and
 * the wait a finish makes on it.
 *
 * The Watch sends `workoutSaved` once its HKWorkout is stored. A finish on the
 * phone waits for that before deciding whether to write the workout itself
 * (see `syncFinishedWorkout` in healthSync.ts), so which confirmation belongs
 * to which finish is what stands between one Health entry and two.
 *
 * Time decides it: a confirmation counts for a finish when it was recorded at
 * or after the instant that finish gives as its start. That instant is when
 * the finish began — except for a finish drained from the launch buffer, where
 * the confirmation can have arrived first (below).
 *
 * No imports and no native calls, so it runs under `npm test`.
 */

type SaveAction = { action: string; uuid?: unknown };

export function createWatchSaveLog(now: () => number = Date.now) {
  // Epoch ms of the latest confirmation; 0 when there has been none.
  let savedAt = 0;
  // The UUID it carried: which Health entry is the Watch's. Null from a Watch
  // build that predates sending it.
  let savedUuid: string | null = null;
  // Installed by the finish that is waiting, so a confirmation wakes it.
  let wake: (() => void) | null = null;

  /** Records `a` if it is a save confirmation; ignores every other action. */
  const note = (a: SaveAction, at: number = now()): void => {
    if (a.action !== 'workoutSaved') return;
    // Never backwards: a buffered confirmation recorded after a live one has
    // landed is the older of the two.
    if (at < savedAt) return;
    savedAt = at;
    savedUuid = typeof a.uuid === 'string' && a.uuid.length > 0 ? a.uuid : null;
    wake?.();
  };

  return {
    note,

    /**
     * Records the confirmations among actions that arrived before JS was
     * listening and were buffered natively, and returns the instant a finish
     * drained with them must wait from.
     *
     * A phone app launched by the Watch's finish can be handed the "saved"
     * before anything has subscribed. By the time the finish from that same
     * drain begins, the confirmation is already in the past, and judged by the
     * finish's own start it would be someone else's. So both are pinned to
     * `at`, the moment of the drain: the finish waits from there, and finds it.
     *
     * A confirmation drained with no finish beside it belongs to a workout
     * that is already over. It is recorded at `at` too, which is before any
     * finish that starts later, so it never counts for one.
     */
    noteDrained(actions: readonly SaveAction[], at: number = now()): number {
      for (const a of actions) note(a, at);
      return at;
    },

    /** The UUID the latest confirmation carried, if it carried one. */
    get uuid(): string | null {
      return savedUuid;
    },

    /**
     * Resolves true once the Watch confirms a save recorded at or after
     * `since`, or false if none lands within `waitMs`. One already on record
     * counts, which closes the race where the confirmation beats the waiter.
     */
    wait(since: number, waitMs: number): Promise<boolean> {
      if (savedAt > 0 && savedAt >= since) return Promise.resolve(true);
      return new Promise((resolve) => {
        let settled = false;
        const done = (saved: boolean) => {
          if (settled) return;
          settled = true;
          if (wake === woken) wake = null;
          clearTimeout(timer);
          resolve(saved);
        };
        const woken = () => done(true);
        wake = woken;
        const timer = setTimeout(() => done(false), waitMs);
      });
    },
  };
}
