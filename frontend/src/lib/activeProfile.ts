/**
 * Which profile is using the app right now (#117), held in memory.
 *
 * The launch sequence (db/bootstrap.ts) sets it once the profile's file is open;
 * switching (Task 6) sets it again. Until then it is the owner, so every key
 * `profileKey` gives is the key the app used before profiles existed.
 *
 * Per-person SecureStore settings go through `profileKey`: the owner keeps
 * today's key names, anyone else gets `ischys.p.<id>.<key>` (domain/profiles).
 */
import { useSyncExternalStore } from 'react';

import { OWNER_ID, scopedKey, type ProfileRow } from '../domain/profiles.ts';

/** Off until the profiles UI ships (Task 15). */
export const PROFILES_ENABLED = false;

/** The name shown until the person sets one. */
export const DEFAULT_NAME = 'Athlete';

/** Stands in for the owner's row before launch has read the registry. */
const OWNER_PLACEHOLDER: ProfileRow = {
  id: OWNER_ID,
  name: DEFAULT_NAME,
  initials: 'A',
  sort: 0,
  isOwner: true,
  createdAt: 0,
  workoutCount: 0,
  firstWorkoutAt: null,
  lastWorkoutAt: null,
};

type Snapshot = { profile: ProfileRow; count: number; epoch: number };

let snapshot: Snapshot = { profile: OWNER_PLACEHOLDER, count: 1, epoch: 0 };
const listeners = new Set<() => void>();
const switchHooks = new Set<() => void>();

function publish(next: Snapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

/** Records the active profile and how many profiles exist. Doesn't switch files. */
export function setActiveProfile(p: ProfileRow, profileCount: number): void {
  publish({ profile: p, count: profileCount, epoch: snapshot.epoch });
}

export function activeProfile(): ProfileRow {
  return snapshot.profile;
}

export function profileCount(): number {
  return snapshot.count;
}

export function isOwnerActive(): boolean {
  return snapshot.profile.isOwner;
}

/** `key` as the active profile stores it: unchanged for the owner. */
export function profileKey(key: string): string {
  return scopedKey(activeProfile().id, key);
}

/** Runs `fn` after every profile switch, to drop per-profile caches. Returns an unsubscribe. */
export function onProfileSwitch(fn: () => void): () => void {
  switchHooks.add(fn);
  return () => {
    switchHooks.delete(fn);
  };
}

/** Runs every switch hook. One that throws doesn't stop the rest. */
export function runProfileSwitchHooks(): void {
  for (const fn of switchHooks) {
    try {
      fn();
    } catch {
      // A cache that failed to clear is the hook's bug; keep clearing the others.
    }
  }
}

/** Changes after a switch, so screens keyed on it remount with the new profile's data. */
export function bumpProfileEpoch(): void {
  publish({ ...snapshot, epoch: snapshot.epoch + 1 });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = (): Snapshot => snapshot;

export function useActiveProfile(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
