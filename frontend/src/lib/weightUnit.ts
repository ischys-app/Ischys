/**
 * The user's weight unit, for every surface that shows or accepts a lifting
 * weight.
 *
 * The preference lives in the settings row (`settings.unit`), and reading it is
 * async — so a screen that fetched it for itself would paint kilograms first and
 * correct a frame later, on every mount. It is cached here instead: read once at
 * startup, updated the moment Settings changes it, and handed to components
 * synchronously through `useWeightUnit`. Changing the unit re-renders every
 * mounted screen that uses it, including ones underneath Settings in the stack.
 *
 * Storage is kilograms regardless; this only decides how a weight is shown and
 * what a typed number means. The conversion and formatting live in
 * domain/units.ts.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { getSettings } from '../data/settingsRepo';
import type { Unit } from '../domain/units';

let current: Unit = 'kg';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cached unit. Kilograms until the first load lands. */
export function getWeightUnit(): Unit {
  return current;
}

/**
 * Record the unit and tell every subscriber. Called by Settings when the user
 * flips the control, and by anything that has just read the settings row.
 */
export function setWeightUnit(unit: Unit): void {
  if (unit !== 'kg' && unit !== 'lb') return;
  if (unit === current) return;
  current = unit;
  listeners.forEach((l) => l());
}

/**
 * Read the preference from storage and cache it. Never throws: with no settings
 * row to read, the cached unit stands. For code outside React — the Live
 * Activity bridge runs on a background launch with no screen mounted.
 */
export async function loadWeightUnit(): Promise<Unit> {
  try {
    setWeightUnit((await getSettings()).unit);
    primed = true;
  } catch {
    // Keep what we had; the next caller tries again.
  }
  return current;
}

/** Set once a read of the settings row has succeeded; see `useWeightUnit`. */
let primed = false;

/**
 * The user's weight unit, live.
 *
 * Reads storage only until one read has succeeded: after that the cache is
 * authoritative, because the settings row has a single writer (Settings) and it
 * reports here. A list of forty workout cards therefore costs a query on the
 * first mount, not one per card per visit.
 */
export function useWeightUnit(): Unit {
  useEffect(() => {
    if (!primed) void loadWeightUnit();
  }, []);
  return useSyncExternalStore(subscribe, getWeightUnit);
}
