/**
 * The "Effort per set" setting, for every surface that shows or asks for a
 * rating.
 *
 * It lives in the settings row (`settings.effort_mode`) and reading that is
 * async, so — exactly as lib/weightUnit.ts does for the unit — it is cached
 * here: primed at startup, updated the moment Settings changes it, and handed
 * to components synchronously through `useEffortMode`. A workout left open
 * underneath Settings therefore follows the switch at once.
 *
 * `'off'` until the first read lands, which is also the default: a screen can
 * never flash a rating at someone who has not turned the feature on.
 *
 * This only decides what is shown. Ratings are stored as RPE regardless, and
 * turning the setting off deletes none of them; see domain/effort.ts.
 */
import { useEffect, useSyncExternalStore } from 'react';

import { getSettings } from '../data/settingsRepo';
import { isEffortMode, type EffortMode } from '../domain/effort';

let current: EffortMode = 'off';
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cached setting. Off until the first load lands. */
export function getEffortMode(): EffortMode {
  return current;
}

/** Record the setting and tell every subscriber. */
export function setEffortMode(mode: EffortMode): void {
  if (!isEffortMode(mode)) return;
  primed = true;
  if (mode === current) return;
  current = mode;
  listeners.forEach((l) => l());
}

/** Set once the settings row has been read (or written); see `useEffortMode`. */
let primed = false;

/** The setting, live. Reads storage only until one read has succeeded. */
export function useEffortMode(): EffortMode {
  useEffect(() => {
    if (primed) return;
    getSettings()
      .then((s) => setEffortMode(s.effort_mode))
      .catch(() => {
        // Keep what we had; the next mount tries again.
      });
  }, []);
  return useSyncExternalStore(subscribe, getEffortMode);
}
