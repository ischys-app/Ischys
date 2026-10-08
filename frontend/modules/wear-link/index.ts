import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

import { parseAction } from './parseAction.ts';
import { createPushGate } from './pushGate.ts';

/**
 * The phone's end of the link to the Wear OS companion (the app in `wear/`).
 *
 * Not imported by the app directly: `modules/health` routes its Watch
 * functions here on Android, so one set of calls serves both kinds of watch.
 * The payloads are the same in both directions — the state built by
 * src/lib/watchState.ts out, `WatchAction`s back — and cross the native
 * boundary as JSON text, which is also how they travel over the Wearable Data
 * Layer.
 */

type WearLinkNativeModule = {
  isAvailable(): boolean;
  startWorkout(): void;
  stopWorkout(discard: boolean): void;
  updateState(json: string): void;
  consumeActions(): Promise<string[]>;
  addListener(
    event: 'onWatchAction' | 'onWatchMetrics',
    listener: (e: any) => void,
  ): { remove(): void };
};

/**
 * Whether the watch on this platform is a Wear OS one, and so whether
 * `modules/health` sends its Watch calls here rather than to its own native
 * module. True on every Android, with or without a Watch.
 */
export const handlesWatch = Platform.OS === 'android';

const native = handlesWatch ? requireOptionalNativeModule<WearLinkNativeModule>('WearLink') : null;

/**
 * Whether there is a Data Layer to talk over: Android, this module built in,
 * and Google Play services present. It says nothing about a Watch being paired
 * — with none, every call below quietly does nothing.
 */
export function isAvailable(): boolean {
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    return false;
  }
}

/** Starts the Watch's session. A no-op with no Watch in reach. */
export function startWorkout(): void {
  try {
    native?.startWorkout();
  } catch {
    // The link is an extra; it must never break starting a workout.
  }
}

/** Ends the Watch's session; `discard` drops what it measured. */
export function stopWorkout(discard: boolean): void {
  try {
    native?.stopWorkout(discard);
  } catch {
    // As above.
  }
}

const worthSending = createPushGate();

/**
 * Pushes the latest workout state to the Watch — unless all that changed is a
 * rest countdown the Watch keeps for itself (see pushGate.ts).
 */
export function updateState(state: Record<string, unknown>): void {
  if (!native || !worthSending(state)) return;
  try {
    native.updateState(JSON.stringify(state));
  } catch {
    // As above.
  }
}

/** Drains the Watch actions that arrived before JS was listening. */
export async function consumeActions(): Promise<Record<string, unknown>[]> {
  if (!native) return [];
  try {
    const pending = await native.consumeActions();
    return pending.map(parseAction).filter((a): a is Record<string, unknown> => a !== null);
  } catch {
    return [];
  }
}

export function addActionListener(fn: (action: Record<string, unknown>) => void): {
  remove(): void;
} {
  if (!native) return { remove: () => {} };
  return native.addListener('onWatchAction', (e: { json?: unknown }) => {
    const action = parseAction(e?.json);
    if (action) fn(action);
  });
}

export function addMetricsListener(fn: (m: { bpm: number; cal: number }) => void): {
  remove(): void;
} {
  if (!native) return { remove: () => {} };
  return native.addListener('onWatchMetrics', fn);
}
