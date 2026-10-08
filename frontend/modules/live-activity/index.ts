import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

export type LiveActivityState = {
  /**
   * Lives in the state, not the attributes: a workout moves between exercises,
   * and ActivityKit attributes are fixed for the Activity's whole life.
   */
  exerciseName: string;
  /**
   * Names an imageset in the widget's own asset catalog (`ExerciseArt/<slug>`,
   * built by `scripts/build-widget-art.mjs`). The extension has no JS and cannot
   * read the app's vector art, so it ships the same drawings as images and only
   * this key crosses the bridge. Absent — or naming art this build does not
   * carry — and the card falls back to the exercise's initials.
   */
  artSlug?: string;
  mode: 'logging' | 'rest';
  subtitle: string;
  weightLabel: string;
  repsLabel: string;
  /** Epoch milliseconds. */
  restStartedAt?: number;
  /** Epoch milliseconds. */
  restEndsAt?: number;
  setId?: string;

  /**
   * Rest to start when ✓ is tapped, and the card as it should look afterwards.
   * The intent redraws from these so a tap on a locked phone is instant; JS
   * still does the write and overwrites this with authoritative state.
   */
  restSeconds: number;
  next?: {
    exerciseName: string;
    artSlug?: string;
    subtitle: string;
    weightLabel: string;
    repsLabel: string;
    setId?: string;
  };

  /**
   * Sets logged and sets planned across the whole workout. Android draws them
   * as the notification's progress bar; the iOS card ignores them. Optional, so
   * a caller that leaves them out just gets no bar.
   */
  setsDone?: number;
  setsTotal?: number;
};

/** A button tapped on the card. Queued natively, applied by JS exactly once. */
export type LiveActivityAction =
  | { action: 'skipRest'; at: number }
  | { action: 'adjustRest'; seconds: number; at: number }
  | { action: 'completeSet'; setId: string; at: number };

type LiveActivityNativeModule = {
  isSupported(): boolean;
  setThemeId?(id: string): void;
  isAvailable(): boolean;
  isActive(): boolean;
  // iOS takes the state as an object; Android as JSON (see `wire`).
  start(workoutStartedAt: number, state: LiveActivityState | string): string | null;
  update(state: LiveActivityState | string): Promise<void>;
  end(): Promise<void>;
  consumeActions(): LiveActivityAction[];
  addListener(event: 'onActions', listener: () => void): { remove(): void };
};

const native = requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');

/**
 * A Live Activity on iOS, an ongoing notification on Android (a Live Update
 * from Android 16); every call is a no-op elsewhere.
 *
 * False *either* because the OS cannot show them or because the user has them
 * switched off for Ischys — see `isAvailable` for telling those two apart. On
 * Android "switched off" means notifications, or the workout channel, are.
 */
export const isSupported = (): boolean =>
  (Platform.OS === 'ios' || Platform.OS === 'android') && !!native && native.isSupported();

/**
 * The OS can show Live Activities, whatever the per-app switch says. So
 * `isAvailable() && !isSupported()` means precisely "turned off for Ischys" —
 * the one case worth telling the user about, because iOS turns the switch off
 * by itself after a card is dismissed and nothing else reveals it.
 *
 * Older builds of the native module have no `isAvailable`; treat its absence as
 * "cannot tell", so nothing is claimed about why the card is missing.
 */
export const isAvailable = (): boolean => {
  if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !native) return false;
  if (typeof native.isAvailable !== 'function') return false;
  return native.isAvailable();
};

/**
 * Whether a workout card is currently live. False after the user swipes it away,
 * which is the signal the workout screen uses to re-show it on foreground.
 *
 * Android differs on the second half: a notification the user dismissed is not
 * reposted for that workout — `start` returns null until `end` is called.
 */
export const isActive = (): boolean => (native ? native.isActive() : false);

/**
 * `workoutStartedAt` is epoch milliseconds. The widget renders the header's
 * elapsed time from it, so it keeps counting while the app is suspended.
 */
export const start = (workoutStartedAt: number, state: LiveActivityState): string | null =>
  native ? native.start(workoutStartedAt, wire(state)) : null;

export const update = async (state: LiveActivityState): Promise<void> => {
  await native?.update(wire(state));
};

/**
 * Android's module converter throws on an object holding `undefined` values,
 * and most of the card's fields are optional. JSON drops them on the way.
 */
const wire = (state: LiveActivityState): LiveActivityState | string =>
  Platform.OS === 'android' ? JSON.stringify(state) : state;

export const end = async (): Promise<void> => {
  await native?.end();
};

/**
 * Drains the queue of card-button taps. Draining clears it, so each action is
 * applied once whether it arrives live or is found waiting after a resume.
 */
export const consumeActions = (): LiveActivityAction[] => native?.consumeActions() ?? [];

/**
 * Fires when a card button is tapped while the app is running. The listener is
 * only a nudge — call `consumeActions()` for the payload, so the live path and
 * the resume path share one code path and cannot double-apply.
 */
export const addActionListener = (listener: () => void): { remove(): void } =>
  native ? native.addListener('onActions', listener) : { remove: () => {} };

/**
 * Mirrors the accent into native storage (the App Group on iOS) so the card or
 * notification matches the app. No-op on an older native build, which simply
 * keeps the default accent.
 */
export const setThemeId = (id: string): void => native?.setThemeId?.(id);
