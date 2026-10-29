/**
 * How many workouts a week the Home screen counts toward ("2 / 4").
 *
 * It was hard-coded to 4, which is a guess about someone else's training week.
 * Stored in SecureStore beside the other small on-device preferences.
 */
import * as SecureStore from 'expo-secure-store';

import { profileKey } from './activeProfile';

const KEY = 'ischys.weeklyWorkoutTarget';

export const DEFAULT_WEEKLY_TARGET = 4;
export const MIN_WEEKLY_TARGET = 1;
export const MAX_WEEKLY_TARGET = 14;

/** The user's weekly goal, or the default when unset/invalid. */
export async function getWeeklyTarget(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(profileKey(KEY));
    const n = Number(raw);
    if (!Number.isInteger(n) || n < MIN_WEEKLY_TARGET || n > MAX_WEEKLY_TARGET) {
      return DEFAULT_WEEKLY_TARGET;
    }
    return n;
  } catch {
    return DEFAULT_WEEKLY_TARGET;
  }
}

/** Persist the weekly goal, clamped to a sane range. */
export async function setWeeklyTarget(n: number): Promise<void> {
  const clamped = Math.min(MAX_WEEKLY_TARGET, Math.max(MIN_WEEKLY_TARGET, Math.round(n)));
  await SecureStore.setItemAsync(profileKey(KEY), String(clamped));
}
