import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

export type LiveActivityState = {
  /**
   * Lives in the state, not the attributes: a workout moves between exercises,
   * and ActivityKit attributes are fixed for the Activity's whole life.
   */
  exerciseName: string;
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
    subtitle: string;
    weightLabel: string;
    repsLabel: string;
    setId?: string;
  };
};

/** A button tapped on the card. Queued natively, applied by JS exactly once. */
export type LiveActivityAction =
  | { action: 'skipRest'; at: number }
  | { action: 'adjustRest'; seconds: number; at: number }
  | { action: 'completeSet'; setId: string; at: number };

type LiveActivityNativeModule = {
  isSupported(): boolean;
  isActive(): boolean;
  start(workoutStartedAt: number, state: LiveActivityState): string | null;
  update(state: LiveActivityState): Promise<void>;
  end(): Promise<void>;
  consumeActions(): LiveActivityAction[];
  addListener(event: 'onActions', listener: () => void): { remove(): void };
};

const native = requireOptionalNativeModule<LiveActivityNativeModule>('LiveActivity');

/** Live Activities are iOS-only; every call is a no-op elsewhere. */
export const isSupported = (): boolean =>
  Platform.OS === 'ios' && !!native && native.isSupported();

/**
 * Whether a workout card is currently live. False after the user swipes it away,
 * which is the signal the workout screen uses to re-show it on foreground.
 */
export const isActive = (): boolean => (native ? native.isActive() : false);

/**
 * `workoutStartedAt` is epoch milliseconds. The widget renders the header's
 * elapsed time from it, so it keeps counting while the app is suspended.
 */
export const start = (workoutStartedAt: number, state: LiveActivityState): string | null =>
  native ? native.start(workoutStartedAt, state) : null;

export const update = async (state: LiveActivityState): Promise<void> => {
  await native?.update(state);
};

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
