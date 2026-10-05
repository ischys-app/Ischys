/**
 * Decides who completes a Watch-initiated finish.
 *
 * The Watch's Finish/Discard buttons end its own `HKWorkoutSession` locally and
 * then ask the phone to do the same (`PhoneLink.endWorkout`). On the phone that
 * arrives as an `onWatchAction` event — and those are plain Expo events with no
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
