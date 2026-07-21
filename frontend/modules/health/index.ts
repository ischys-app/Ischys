import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/** Aggregates over a workout's window. A field is null when no Watch recorded it. */
export type WorkoutMetrics = {
  avgHr: number | null;
  maxHr: number | null;
  energyKcal: number | null;
};

type HealthNativeModule = {
  isAvailable(): boolean;
  requestAuthorization(): Promise<boolean>;
  /** `startedAt`/`endedAt` are epoch ms; `energyKcal` 0 to attach no energy. */
  saveWorkout(startedAt: number, endedAt: number, energyKcal: number): Promise<boolean>;
  readWorkoutMetrics(startedAt: number, endedAt: number): Promise<WorkoutMetrics>;
  startHeartRateUpdates(): void;
  stopHeartRateUpdates(): void;
  startWatchWorkout(): void;
  stopWatchWorkout(discard: boolean): void;
  updateWatchState(state: Record<string, unknown>): void;
  addListener(
    event: 'onHeartRate' | 'onWatchMetrics' | 'onWatchAction',
    listener: (e: any) => void,
  ): { remove(): void };
};

const native = requireOptionalNativeModule<HealthNativeModule>('Health');

/** HealthKit is iOS-only; every call is a no-op elsewhere. */
export const isAvailable = (): boolean =>
  Platform.OS === 'ios' && !!native && native.isAvailable();

/**
 * Prompts for HealthKit access (write workouts + energy, read heart rate).
 * Resolves once the user has answered — true does not guarantee write access,
 * because HealthKit refuses to disclose write grants. A denied save just no-ops.
 */
export const requestAuthorization = async (): Promise<boolean> =>
  native ? native.requestAuthorization() : false;

/**
 * Saves a finished workout to Apple Health as a strength-training HKWorkout,
 * attaching `energyKcal` when a Watch measured it (pass 0 for none). Returns
 * false when Health is unavailable or the range is bad.
 */
export const saveWorkout = async (
  startedAt: number,
  endedAt: number,
  energyKcal = 0,
): Promise<boolean> => (native ? native.saveWorkout(startedAt, endedAt, energyKcal) : false);

/** Avg/max HR and energy a Watch recorded for [startedAt, endedAt]. */
export const readWorkoutMetrics = async (
  startedAt: number,
  endedAt: number,
): Promise<WorkoutMetrics> =>
  native
    ? native.readWorkoutMetrics(startedAt, endedAt)
    : { avgHr: null, maxHr: null, energyKcal: null };

/**
 * Streams live heart rate from a recording Apple Watch. The listener fires only
 * while a Watch workout is feeding HealthKit; with no Watch it never fires, so
 * the caller shows nothing rather than a stale or invented number. Returns an
 * unsubscribe that also stops the underlying query.
 */
export const onHeartRate = (listener: (bpm: number) => void): (() => void) => {
  if (!native) return () => {};
  const sub = native.addListener('onHeartRate', (e) => listener(e.bpm));
  native.startHeartRateUpdates();
  return () => {
    native.stopHeartRateUpdates();
    sub.remove();
  };
};

/**
 * Launches the Ischys Watch app and starts its workout session, so the Watch
 * measures without the user opening anything. A no-op with no paired Watch — the
 * live-HR read path still works if they start a session another way.
 */
export const startWatchWorkout = (): void => native?.startWatchWorkout();

/**
 * Ends the Watch session (WatchConnectivity). Harmless if none is running.
 * `discard: true` tells the Watch to throw its recording away instead of saving
 * it to Health — used when the user discards the workout on the phone.
 */
export const stopWatchWorkout = (discard = false): void => native?.stopWatchWorkout(discard);

/** A control the user tapped on the Watch. Applied by the phone (JS is source of truth). */
export type WatchAction =
  | { action: 'logSet'; weight: string; reps: string }
  | { action: 'adjustRest'; seconds: number }
  | { action: 'skipRest' }
  | { action: 'end' }
  | { action: 'discard' }
  | { action: 'addSet' }
  | { action: 'startEmpty' }
  | { action: 'startRoutine'; routineId: string }
  | { action: 'requestState' }
  /** The Watch confirming it saved this session's HKWorkout (see healthSync). */
  | { action: 'workoutSaved' };

/** The workout state pushed to the Watch. Mirrors PhoneState in the watch target. */
export type WatchState = Record<string, unknown>;

/** Push the latest workout state to the Watch (coalesced natively). */
export const updateWatchState = (state: WatchState): void => native?.updateWatchState(state);

/** Subscribe to Watch control taps. */
export const addWatchActionListener = (fn: (a: WatchAction) => void): { remove(): void } =>
  native ? native.addListener('onWatchAction', fn as (e: unknown) => void) : { remove: () => {} };

/** Subscribe to live HR/energy streamed from the Watch. */
export const addWatchMetricsListener = (
  fn: (m: { bpm: number; cal: number }) => void,
): { remove(): void } =>
  native ? native.addListener('onWatchMetrics', fn as (e: unknown) => void) : { remove: () => {} };
