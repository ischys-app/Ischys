/**
 * Switching profiles (#117, spec "Switching (P7)"): points `db` at another
 * profile's file, drops every in-memory cache that held the previous
 * profile's data, and remounts the tab screens.
 *
 * The order, and what a failure leaves, is in switchSequence.ts (tested there);
 * this wires it to the database, SecureStore and the screen. The tab navigator
 * remounts on the epoch bump (app/(tabs)/_layout.tsx), and the root stack
 * dismisses whatever was open above the tabs (app/_layout.tsx).
 */
import * as SecureStore from './secureStore';
import { AccessibilityInfo } from 'react-native';

import {
  closeConnection,
  currentConnection,
  openConnection,
  transactionOpen,
  useConnection,
} from '../db/client';
import { applySettings, prepareConnection, readSettings, tidyCurrentConnection } from '../db/bootstrap';
import { listProfiles, writeProfileStats } from '../data/profilesRepo';
import { completedWorkoutStats, countWorkouts } from '../data/workoutsRepo';
import {
  activeProfile,
  bumpProfileEpoch,
  runProfileSwitchHooks,
  setActiveProfile,
} from './activeProfile';
import { recallActiveWorkoutEntry } from './activeWorkout';
import { haptics } from './haptics';
import { createSwitcher, type SwitchResult } from './switchSequence';

const ACTIVE_PROFILE_KEY = 'ischys.activeProfileId';

/** Caches the current file's completed-workout stats in the registry, for the switcher. */
export async function refreshCurrentProfileStats(): Promise<void> {
  const id = activeProfile().id;
  const stats = await completedWorkoutStats();
  await writeProfileStats(id, stats);
}

/**
 * The profile whose workout is running, or null. The current file first: the
 * reopen pointer is cleared when a workout is minimised (it only decides where
 * a relaunch opens), and a stale pointer naming another profile must not hide
 * a workout running here. Then the pointer, for a workout in another file.
 */
export async function runningWorkoutProfileId(): Promise<string | null> {
  if ((await countWorkouts('active')) > 0) return activeProfile().id;
  return recallActiveWorkoutEntry()?.profileId ?? null;
}

const switcher = createSwitcher({
  currentProfile: activeProfile,
  activeWorkoutProfileId: runningWorkoutProfileId,
  transactionOpen,
  listProfiles,
  refreshStats: refreshCurrentProfileStats,
  currentConnection,
  openConnection,
  prepareConnection,
  useConnection,
  closeConnection,
  setActiveProfile,
  runHooks: runProfileSwitchHooks,
  readSettings,
  applySettings,
  tidy: tidyCurrentConnection,
  rememberProfile: (id) => SecureStore.setItem(ACTIVE_PROFILE_KEY, id),
  bumpEpoch: bumpProfileEpoch,
  haptic: () => haptics.select(),
  announce: (text) => AccessibilityInfo.announceForAccessibility(text),
  warn: (message, error) => console.warn(message, error),
});

/**
 * Switches to `targetId`. Refused, with nothing changed, when it is already
 * active (`'same'`), a workout is running (`'workout'`), or a transaction or
 * another switch is under way (`'busy'`). Throws when the target's file can't
 * be opened or prepared, with the previous profile still active.
 */
export function switchProfile(targetId: string): Promise<SwitchResult> {
  return switcher(targetId);
}
