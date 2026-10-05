/**
 * Decides who completes a Watch-initiated finish, and what the Watch is told
 * about how it went (the handshake, at the end of this file).
 *
 * The Watch's Finish/Discard buttons ask the phone to finish or discard the
 * workout (`WorkoutModel.requestFinish`, `PhoneLink.discardWorkout`). On the
 * phone that arrives as an `onWatchAction` event — and those are plain Expo events with no
 * buffering: whatever is listening at that instant handles it, and nothing else
 * ever will.
 *
 * The bug that motivated this module: `end` was handled ONLY inside the workout
 * screen. Finish on the wrist while that screen is not mounted — the user backed
 * out to Home, or iOS terminated the backgrounded app and `sendMessage` relaunched
 * it at the root route — and the event landed with no handler. The Watch showed
 * the workout finished, the phone left it `status: 'active'`, and Home offered to
 * resume a workout that was already over.
 *
 * So the root layout listens too, and this module decides which of the two acts:
 * the screen when it is mounted (it owns the full finish — Live Activity, Health
 * mirror, navigation to the summary), the root's fallback when it is not.
 * Routing rather than both-run, because a double finish would race the DB write
 * and double-fire the Health mirror.
 */

/**
 * The workout id the mounted workout screen is handling, or null when no screen
 * is mounted. Module state rather than React state on purpose: the root layout's
 * listener is registered once, outside any component that could observe a hook.
 */
let claimedWorkoutId: string | null = null;

/** Where a Watch action should be handled. */
export type WatchFinishRoute = 'screen' | 'fallback' | 'ignore';

/** Actions that complete a workout. Everything else only makes sense to a
 *  mounted workout screen, so the fallback must never act on it. */
const COMPLETING_ACTIONS = new Set(['end', 'discard']);

/** Whether a Watch action ends the workout (Finish or Discard) rather than acting within it. */
export function completesWorkout(action: string): boolean {
  return COMPLETING_ACTIONS.has(action);
}

/**
 * Called by the workout screen while it is mounted. The returned release is
 * unmount-safe: it only clears the claim if this claim is still the current one,
 * so a slow unmount can't wipe out the claim a newly mounted screen just made.
 */
export function claimWatchFinish(workoutId: string): () => void {
  claimedWorkoutId = workoutId;
  return () => {
    if (claimedWorkoutId === workoutId) claimedWorkoutId = null;
  };
}

/**
 * Whether a workout screen is mounted and holding the Watch's Finish.
 *
 * For the fallback when it cannot tell which workout is active (reading it
 * failed), and so cannot route: a mounted screen answers the Watch itself, and
 * a "failed" sent over its head would show "Couldn't finish" on the wrist for
 * a finish that is about to work.
 */
export function screenHoldsWatchFinish(): boolean {
  return claimedWorkoutId !== null;
}

/** Drops every claim. Test seam — production code releases via `claimWatchFinish`. */
export function releaseAllWatchFinishClaims(): void {
  claimedWorkoutId = null;
}

type FinishedListener = (workoutId: string) => void;
const finishedListeners = new Set<FinishedListener>();

/**
 * Fires when the fallback completed a workout, so screens showing it as running
 * can correct themselves.
 *
 * Home needs this: it refetches the active workout on navigation *focus*, and a
 * Watch finish moves nothing. Without a nudge its "workout in progress" bar sits
 * there offering to resume a workout that has already been written to history —
 * whether the app was in the foreground the whole time or backgrounded in a
 * pocket, since returning from background is not a focus change either.
 */
export function onWatchFinished(listener: FinishedListener): () => void {
  finishedListeners.add(listener);
  return () => {
    finishedListeners.delete(listener);
  };
}

/** Announces a fallback finish. Every listener runs even if an earlier one throws. */
export function notifyWatchFinished(workoutId: string): void {
  for (const listener of finishedListeners) {
    try {
      listener(workoutId);
    } catch {
      // A subscriber mid-unmount must not swallow the notification for the rest.
    }
  }
}

/**
 * Who should handle `action`, given the workout the phone currently has active.
 * `activeWorkoutId` is what the DB says is running, not what any screen believes.
 */
export function routeWatchFinish(
  action: string,
  activeWorkoutId: string | null,
): WatchFinishRoute {
  if (!COMPLETING_ACTIONS.has(action)) return 'ignore';
  if (!activeWorkoutId) return 'ignore';
  return claimedWorkoutId === activeWorkoutId ? 'screen' : 'fallback';
}

// --- the finish handshake (#95) ----------------------------------------------
//
// The Watch used to end its session, save the recording to Apple Health and go
// back to its Start screen the moment Finish was tapped, and only then ask the
// phone to finish. A finish that then failed on the phone left the workout
// running there with a Watch that had already stopped and saved.
//
// Now the Watch asks first and keeps recording until the phone says how it
// went. Its request carries a `finishId`; the phone answers with that id and
// `finished` or `failed`. A Watch that gets no answer in
// `WATCH_VERDICT_TIMEOUT_MS` ends and saves on its own, as it always did, so a
// phone that is out of range, suspended or on an older build cannot strand it.
//
// The id is what makes an answer safe to deliver late or twice: the Watch acts
// only on the answer to the request it is still waiting on. It is also how the
// phone tells a waiting Watch from one that is not (an older build, or one that
// could not reach the phone and has already saved): no id, no answer, and
// everything behaves as it did before.

/** How the phone's finish went, as told to the Watch. */
export type WatchFinishOutcome = 'finished' | 'failed';

/**
 * How long the Watch waits for the outcome before ending and saving anyway.
 * Mirrors `FinishHandshake.verdictTimeout` in the Watch target; the two must
 * agree, because the phone's own wait below is sized from it.
 */
export const WATCH_VERDICT_TIMEOUT_MS = 8_000;

// How long the phone waits for the Watch to confirm it saved the HKWorkout
// before asking Health and, finding nothing, writing the workout itself. The
// confirmation is a WatchConnectivity message, near-instant while the Watch is
// reachable, so this only elapses in full when the Watch did not save or could
// not say so. Erring toward writing on timeout risks a rare duplicate but never
// a lost workout.
const WATCH_SAVE_WAIT_MS = 10_000;

/**
 * How long a finish waits for the Watch's "saved" confirmation.
 *
 * A Watch that ended its session before asking has saved by the time the phone
 * starts waiting. One that is waiting for the outcome saves only after the
 * outcome reaches it, and if that message is lost, only once its own timeout
 * has run out. The phone has to still be listening then: giving up first means
 * asking Health for a recording that has not synced over yet, finding nothing,
 * and writing a second entry. So the wait covers the Watch's whole timeout and
 * then the usual allowance for the save and its confirmation.
 */
export function watchSaveWaitMs(watchAwaitsOutcome: boolean): number {
  return watchAwaitsOutcome ? WATCH_VERDICT_TIMEOUT_MS + 12_000 : WATCH_SAVE_WAIT_MS;
}

/**
 * The id of the finish request in a Watch action, when the Watch is waiting to
 * hear how it went; null when it is not waiting, or the action is not a Finish.
 */
export function finishRequestId(action: { action: string; finishId?: unknown }): string | null {
  if (action.action !== 'end') return null;
  return typeof action.finishId === 'string' && action.finishId.length > 0
    ? action.finishId
    : null;
}

/** The outcome message for a waiting Watch, or null when it is not waiting. */
export function finishVerdict(
  outcome: WatchFinishOutcome,
  finishId: string | null,
): { finishVerdict: WatchFinishOutcome; finishId: string } | null {
  return finishId ? { finishVerdict: outcome, finishId } : null;
}

/**
 * What to push to the Watch with an outcome: the workout state, when there is
 * one to show, carrying the outcome for a Watch that is waiting. Null when
 * there is nothing to send. Travelling in one message means the Watch cannot
 * get the state without the outcome, or the other way round.
 */
export function withFinishVerdict<S extends Record<string, unknown>>(
  state: S | null,
  outcome: WatchFinishOutcome,
  finishId: string | null,
): Record<string, unknown> | null {
  const verdict = finishVerdict(outcome, finishId);
  if (!verdict) return state;
  return { ...state, ...verdict };
}
