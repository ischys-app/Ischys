/**
 * Persistence for the running rest ("break") countdown of the active workout,
 * so it survives the workout screen unmounting — leaving the screen (minimise /
 * navigate away) tears down component state, which used to reset a running rest
 * to zero on return (#43).
 *
 * What is stored is the *absolute* end timestamp (epoch ms), never a remaining
 * count: on remount `remaining = max(0, endsAt - now)` is recomputed, so the
 * countdown is correct immediately however long the screen was gone.
 *
 * Two layers, keyed by workout id:
 *  - a module-level Map that outlives any screen mount, which covers the
 *    reported case (navigating within the app), and
 *  - expo-secure-store (already a dependency), so a rest also survives a full
 *    app kill / cold start.
 *
 * The store is never cleared on mount — only when the rest is skipped, ends, or
 * the workout is finished / discarded (see clearRest) — so restoring on remount
 * cannot race a clear.
 */
import * as SecureStore from 'expo-secure-store';

import { onProfileSwitch } from './activeProfile';

export interface RestSession {
  /** Epoch ms the rest ends. remaining = max(0, endsAt - now). */
  endsAt: number;
  /** Full rest duration (seconds) — drives the progress ring. */
  total: number;
  /** Exercise whose rest is running; null for a manually-started rest. */
  exerciseId: string | null;
}

const KEY = 'ischys.restSession';
const mem = new Map<string, RestSession>();

// Rests of the previous profile's workouts (#117). The persisted entry names
// its workout, which no other profile's file holds, so it is left for the
// profile it belongs to.
onProfileSwitch(() => mem.clear());

/** Record/replace the in-flight rest for a workout. */
export function saveRest(workoutId: string, rest: RestSession): void {
  mem.set(workoutId, rest);
  try {
    SecureStore.setItem(KEY, JSON.stringify({ workoutId, ...rest }));
  } catch {
    // Storage unavailable — the in-memory layer still covers navigation.
  }
}

/** Drop any persisted rest for a workout (skip / natural end / finish / discard). */
export function clearRest(workoutId: string): void {
  mem.delete(workoutId);
  try {
    SecureStore.deleteItemAsync(KEY).catch(() => {});
  } catch {
    // as above
  }
}

function readPersisted(workoutId: string): RestSession | null {
  try {
    const raw = SecureStore.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<RestSession> & { workoutId?: string };
    if (r.workoutId !== workoutId || typeof r.endsAt !== 'number') return null;
    return {
      endsAt: r.endsAt,
      total: typeof r.total === 'number' ? r.total : 0,
      exerciseId: typeof r.exerciseId === 'string' ? r.exerciseId : null,
    };
  } catch {
    return null;
  }
}

/**
 * The in-flight rest for a workout, or null if none / already elapsed. Prefers
 * the in-memory copy (navigation within a live app) and falls back to the
 * persisted one (cold start). An expired rest is cleared and reported as none.
 */
export function loadRest(workoutId: string): RestSession | null {
  const rest = mem.get(workoutId) ?? readPersisted(workoutId);
  if (!rest) return null;
  if (rest.endsAt <= Date.now()) {
    clearRest(workoutId);
    return null;
  }
  // Keep the in-memory layer warm after a cold-start read.
  mem.set(workoutId, rest);
  return rest;
}
