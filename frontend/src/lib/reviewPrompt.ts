/**
 * App Store review nudge.
 *
 * After a user has *genuinely finished* a handful of workouts we ask iOS to show
 * its native review prompt (StoreKit's `SKStoreReviewController`, surfaced by
 * expo-store-review). We never draw our own rating UI around it — Apple forbids
 * gating a review behind a custom dialog, and iOS already throttles the real
 * prompt to ~3×/year, so this call is a soft nudge that may show nothing.
 *
 * All state lives in SecureStore so it survives reinstalls-with-restore the same
 * way the rest of the app's small persisted flags do. Everything here is
 * best-effort: a single try/catch swallows any failure so a review nudge can
 * never break the Summary screen it's fired from.
 */
import * as SecureStore from './secureStore';
import * as StoreReview from 'expo-store-review';

/** Running count of genuinely-finished workouts. */
const KEY_COUNT = 'ischys.reviewWorkoutCount';
/** Last workout id we counted — guards against a re-render double-count. */
const KEY_LAST_ID = 'ischys.reviewLastWorkoutId';
/** ISO timestamp of when we asked for a review (set once we've asked). */
const KEY_ASKED_AT = 'ischys.reviewAskedAt';

/** Finished-workout count at which we first nudge for a review. */
const THRESHOLD = 3;

/**
 * Call after a real workout finish (i.e. the Summary screen was reached with
 * `justFinished === '1'`). Increments the finished-workout counter exactly once
 * per workout, and — once the count reaches THRESHOLD and we haven't asked before
 * — asks iOS to show its review prompt.
 *
 * Never throws; safe to fire-and-forget from a `useEffect`.
 */
export async function maybeRequestReviewAfterFinish(workoutId: string): Promise<void> {
  try {
    if (!workoutId) return;

    // De-dupe: a re-mount / re-render of the same summary must not re-count.
    const lastId = await SecureStore.getItemAsync(KEY_LAST_ID);
    if (lastId === workoutId) return;

    const prev = await SecureStore.getItemAsync(KEY_COUNT);
    const count = (Number.parseInt(prev ?? '0', 10) || 0) + 1;

    // Record the new count and the id we just counted, before doing anything
    // else — if the prompt path below throws, we still won't double-count.
    await SecureStore.setItemAsync(KEY_COUNT, String(count));
    await SecureStore.setItemAsync(KEY_LAST_ID, workoutId);

    if (count < THRESHOLD) return;

    // Only ask once. iOS throttles the real prompt anyway, but recording that
    // we asked keeps us from calling into StoreKit on every finish forever.
    const askedAt = await SecureStore.getItemAsync(KEY_ASKED_AT);
    if (askedAt) return;

    // `isAvailableAsync` is false on the simulator and where StoreKit review
    // isn't supported — that's expected; just skip silently.
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    await StoreReview.requestReview();
    await SecureStore.setItemAsync(KEY_ASKED_AT, new Date().toISOString());
  } catch {
    // Best-effort — a review nudge must never surface an error to the user.
  }
}
