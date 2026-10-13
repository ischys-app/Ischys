/**
 * App Store review nudge.
 *
 * After a user has *genuinely finished* a handful of workouts we ask iOS to show
 * its native review prompt (StoreKit's `SKStoreReviewController`, surfaced by
 * expo-store-review). We never draw our own rating UI around it — Apple forbids
 * gating a review behind a custom dialog, and iOS already throttles the real
 * prompt to ~3×/year, so this call is a soft nudge that may show nothing.
 *
 * Because that first call so often shows nothing, we ask again on a later
 * version once enough time and training have passed — `shouldAskForReview`
 * holds the rule.
 *
 * All state lives in SecureStore so it survives reinstalls-with-restore the same
 * way the rest of the app's small persisted flags do. Everything here is
 * best-effort: a single try/catch swallows any failure so a review nudge can
 * never break the Summary screen it's fired from.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

import { shouldAskForReview } from '../domain/reviewPolicy';

/** Running count of genuinely-finished workouts. */
const KEY_COUNT = 'ischys.reviewWorkoutCount';
/** Last workout id we counted — guards against a re-render double-count. */
const KEY_LAST_ID = 'ischys.reviewLastWorkoutId';
/** ISO timestamp of when we last asked for a review. */
const KEY_ASKED_AT = 'ischys.reviewAskedAt';
/** Finished-workout count when we last asked. */
const KEY_ASKED_COUNT = 'ischys.reviewAskedCount';
/** App version we last asked on. */
const KEY_ASKED_VERSION = 'ischys.reviewAskedVersion';

const APP_VERSION = Constants.expoConfig?.version ?? '';

/**
 * Call after a real workout finish (i.e. the Summary screen was reached with
 * `justFinished === '1'`). Increments the finished-workout counter exactly once
 * per workout, and asks iOS to show its review prompt when `shouldAskForReview`
 * says it is time.
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

    const now = Date.now();
    const askedAtIso = await SecureStore.getItemAsync(KEY_ASKED_AT);
    const askedCount = await SecureStore.getItemAsync(KEY_ASKED_COUNT);
    // An unreadable timestamp counts as "just asked" every time, so it blocks further asks.
    const askedAtMs = askedAtIso ? Date.parse(askedAtIso) : NaN;
    const ask = shouldAskForReview({
      count,
      askedAt: askedAtIso ? (Number.isFinite(askedAtMs) ? askedAtMs : now) : null,
      askedCount: askedCount ? Number.parseInt(askedCount, 10) || null : null,
      askedVersion: await SecureStore.getItemAsync(KEY_ASKED_VERSION),
      appVersion: APP_VERSION,
      now,
    });
    if (!ask) return;

    // `isAvailableAsync` is false on the simulator and where StoreKit review
    // isn't supported — that's expected; just skip silently.
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    await StoreReview.requestReview();
    await SecureStore.setItemAsync(KEY_ASKED_AT, new Date(now).toISOString());
    await SecureStore.setItemAsync(KEY_ASKED_COUNT, String(count));
    await SecureStore.setItemAsync(KEY_ASKED_VERSION, APP_VERSION);
  } catch {
    // Best-effort — a review nudge must never surface an error to the user.
  }
}
