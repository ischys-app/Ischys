/**
 * The P6 sheet's state (#117): "Finish ‹First›'s workout first". Only one
 * workout can run at a time across every profile, so a switch away from a
 * running workout is refused; this says why and offers the way back to it.
 *
 * One sheet, mounted once in app/_layout.tsx, shown from the switcher and
 * from Add profile (whose new profile exists, but the switch to it was
 * refused). `presentFinishWorkoutFirst` loads what the sheet says first, so
 * it opens with its words in place.
 */
import { eq } from 'drizzle-orm';
import { type Href, router } from 'expo-router';
import { useSyncExternalStore } from 'react';

import { listWorkouts } from '../api/workouts';
import { listProfiles } from '../data/profilesRepo';
import * as schema from '../db/schema';
import { readSideConnection } from '../db/sideConnection';
import type { ProfileRow } from '../domain/profiles';
import { activeProfile, onProfileSwitch } from './activeProfile';
import { recallActiveWorkoutEntry } from './activeWorkout';
import { haptics } from './haptics';
import { parseServerDate } from './serverTime';
import { runningWorkoutProfileId, switchProfile } from './switchProfile';

/** What the sheet shows: whose workout runs, which, since when, and the refused target. */
export type FinishFirstRequest = {
  running: ProfileRow;
  target: ProfileRow;
  workoutId: string;
  workoutName: string | null;
  startedAt: number;
  /** Runs once the sheet is gone, however it was closed (Add profile goes back). */
  onDismissed?: () => void;
};

let request: FinishFirstRequest | null = null;
let visible = false;
/** A route to push once a switch has dismissed the screens above the tabs. */
let routeAfterSwitch: Href | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// The sheet names the previous profile's workout; a switch closes it.
onProfileSwitch(() => {
  if (!visible) return;
  visible = false;
  sync();
});

type Snapshot = { request: FinishFirstRequest | null; visible: boolean };
let snapshot: Snapshot = { request, visible };
function sync() {
  snapshot = { request, visible };
  emit();
}
const getSnapshot = (): Snapshot => snapshot;

export function useFinishWorkoutFirst(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot,
    getSnapshot,
  );
}

/** The running workout in `profileId`'s file: the current file, or that profile's own. */
async function runningWorkoutIn(
  profileId: string,
): Promise<{ id: string; name: string | null; startedAt: number } | null> {
  if (profileId === activeProfile().id) {
    const [w] = await listWorkouts({ status: 'active', limit: 1 });
    if (!w) return null;
    const t = parseServerDate(w.started_at);
    return Number.isNaN(t) ? null : { id: w.id, name: w.name, startedAt: t };
  }
  // Only after a failed launch: the reopen pointer names another profile.
  const entry = recallActiveWorkoutEntry();
  if (!entry || entry.profileId !== profileId) return null;
  const row = await readSideConnection(profileId, async (conn) => {
    const [w] = await conn.drizzle
      .select({ id: schema.workouts.id, name: schema.workouts.name, startedAt: schema.workouts.startedAt })
      .from(schema.workouts)
      .where(eq(schema.workouts.id, entry.workoutId));
    return w ?? null;
  });
  return row ?? null;
}

/**
 * Shows the P6 sheet for a switch to `targetId` that was refused because a
 * workout is running. When there is nothing to show (the workout ended in the
 * meantime, or its file can't be read), a warning haptic, `onDismissed`, and
 * false.
 * `delayMs` lets another sheet finish leaving first: two sheets are two
 * modals, and iOS won't present one while the other is still up.
 */
export async function presentFinishWorkoutFirst(
  targetId: string,
  opts: { onDismissed?: () => void; delayMs?: number } = {},
): Promise<boolean> {
  let next: FinishFirstRequest | null = null;
  try {
    const runningId = await runningWorkoutProfileId();
    if (runningId !== null) {
      const [profiles, workout] = await Promise.all([listProfiles(), runningWorkoutIn(runningId)]);
      const running = profiles.find((p) => p.id === runningId);
      const target = profiles.find((p) => p.id === targetId);
      if (running && target && workout) {
        next = {
          running,
          target,
          workoutId: workout.id,
          workoutName: workout.name,
          startedAt: workout.startedAt,
          onDismissed: opts.onDismissed,
        };
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[profiles] finish-first sheet failed to load', e);
  }
  if (next === null) {
    haptics.warning();
    opts.onDismissed?.();
    return false;
  }
  haptics.warning();
  const shown = next;
  const show = () => {
    request = shown;
    visible = true;
    sync();
  };
  if (opts.delayMs) setTimeout(show, opts.delayMs);
  else show();
  return true;
}

/** Closes the sheet. `onDismissed` runs once, when it was showing. */
export function dismissFinishWorkoutFirst(): void {
  if (!visible) return;
  visible = false;
  sync();
  const done = request?.onDismissed;
  if (request) request = { ...request, onDismissed: undefined };
  snapshot = { request, visible };
  done?.();
}

/**
 * "Go to workout". The running workout's profile is normally the current one:
 * push it. When it belongs to another profile (only after a failed launch),
 * switch there first (allowed, Ruling R8), then push once the switch has
 * dismissed the screens above the tabs (app/_layout.tsx).
 */
export async function goToRunningWorkout(r: FinishFirstRequest): Promise<void> {
  const route: Href = `/workout/${r.workoutId}`;
  if (r.running.id === activeProfile().id) {
    router.push(route);
    return;
  }
  routeAfterSwitch = route;
  try {
    const result = await switchProfile(r.running.id);
    if (result === 'ok') return;
    routeAfterSwitch = null;
    if (result === 'same') router.push(route);
    else haptics.warning();
  } catch (e) {
    routeAfterSwitch = null;
    haptics.warning();
    if (__DEV__) console.warn('[profiles] switch to the running workout failed', e);
  }
}

/** The route `goToRunningWorkout` left for after its switch, once. */
export function takeRouteAfterSwitch(): Href | null {
  const r = routeAfterSwitch;
  routeAfterSwitch = null;
  return r;
}
