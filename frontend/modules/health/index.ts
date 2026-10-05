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
  hasWorkout(startedAt: number, endedAt: number): Promise<boolean>;
  readWorkoutMetrics(startedAt: number, endedAt: number): Promise<WorkoutMetrics>;
  readBodyMass(): Promise<number | null>;
  startHeartRateUpdates(): void;
  stopHeartRateUpdates(): void;
  startWatchWorkout(): void;
  stopWatchWorkout(discard: boolean): void;
  updateWatchState(state: Record<string, unknown>): void;
  consumeWatchActions?(): Promise<Record<string, unknown>[]>;
  readBodyMeasurements?(): Promise<Record<string, { value: number; measuredAt: number; uuid: string }>>;
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

/**
 * Whether Ischys — the phone app or its Watch companion — has already written a
 * strength HKWorkout covering this window. The phone checks before writing a
 * workout the Watch may have saved without its confirmation arriving in time.
 *
 * False on an older native module that lacks the query, which just restores the
 * previous behaviour: write and risk the duplicate rather than lose the workout.
 */
export const hasWorkout = async (startedAt: number, endedAt: number): Promise<boolean> => {
  if (!native || typeof native.hasWorkout !== 'function') return false;
  try {
    return await native.hasWorkout(startedAt, endedAt);
  } catch {
    return false;
  }
};

/** Avg/max HR and energy a Watch recorded for [startedAt, endedAt]. */
export const readWorkoutMetrics = async (
  startedAt: number,
  endedAt: number,
): Promise<WorkoutMetrics> =>
  native
    ? native.readWorkoutMetrics(startedAt, endedAt)
    : { avgHr: null, maxHr: null, energyKcal: null };

/**
 * The user's most recent bodyweight from Apple Health, in kilograms, or null if
 * none is recorded / read access was refused / the native module predates this.
 * Null on an older native module rather than throwing, so a stale build degrades
 * to "no reading" instead of crashing the settings screen.
 */
export const readBodyMass = async (): Promise<number | null> => {
  if (!native || typeof native.readBodyMass !== 'function') return null;
  try {
    return await native.readBodyMass();
  } catch {
    return null;
  }
};

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
  /**
   * `weight` is in `unit` — the unit the Watch was showing when the set was
   * logged, so the phone never has to guess. Absent from a Watch build that
   * predates the field; the phone then falls back to the unit it last pushed.
   */
  | { action: 'logSet'; weight: string; reps: string; unit?: 'kg' | 'lb' }
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

/**
 * Drains Watch actions that arrived before any JS listener existed, and marks JS
 * as listening from here on. Only workout-ending actions are ever buffered — see
 * `consumeWatchActions` in the native module for why.
 *
 * Empty on an older native build that lacks the function, which just restores the
 * previous behaviour (the pre-subscribe window drops the action).
 */
export const consumeWatchActions = async (): Promise<WatchAction[]> =>
  native?.consumeWatchActions
    ? ((await native.consumeWatchActions()) as unknown as WatchAction[])
    : [];

/**
 * Latest waist and body-fat readings from Health, each with the sample's uuid
 * so a re-read updates the same row instead of appending a duplicate.
 *
 * Empty on an older native build, which simply means no Health-sourced
 * measurements — the manually logged ones are unaffected.
 */
export const readBodyMeasurements = async (): Promise<
  Record<string, { value: number; measuredAt: number; uuid: string }>
> => (native?.readBodyMeasurements ? native.readBodyMeasurements() : {});

/** Subscribe to Watch control taps. */
export const addWatchActionListener = (fn: (a: WatchAction) => void): { remove(): void } =>
  native ? native.addListener('onWatchAction', fn as (e: unknown) => void) : { remove: () => {} };

/** Subscribe to live HR/energy streamed from the Watch. */
export const addWatchMetricsListener = (
  fn: (m: { bpm: number; cal: number }) => void,
): { remove(): void } =>
  native ? native.addListener('onWatchMetrics', fn as (e: unknown) => void) : { remove: () => {} };
