import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/** Aggregates over a workout's window. A field is null when no Watch recorded it. */
export type WorkoutMetrics = {
  avgHr: number | null;
  maxHr: number | null;
  energyKcal: number | null;
};

/** Which half of Ischys wrote an entry: the phone app, or the Watch's session. */
export type WorkoutWriter = 'phone' | 'watch';

/** Ischys's strength workout in Health over a window. Times are epoch ms. */
export type FoundWorkout = {
  uuid: string;
  startedAt: number;
  endedAt: number;
  energyKcal: number;
  writer: WorkoutWriter;
  /** The bundle id HealthKit names as the entry's source. */
  bundleId: string;
};

export type ReplaceWorkoutResult =
  | { status: 'replaced'; uuid: string }
  /** No entry with that UUID any more. */
  | { status: 'missing' }
  /** Not an entry the phone wrote (a Watch recording). Nothing was done to it. */
  | { status: 'notOurs' }
  /** iOS does not let Ischys write workouts. */
  | { status: 'denied' }
  | { status: 'failed' }
  /** No Health here, or a native module that predates replacing. */
  | { status: 'unavailable' };

type HealthNativeModule = {
  isAvailable(): boolean;
  requestAuthorization(): Promise<boolean>;
  /** `startedAt`/`endedAt` are epoch ms; `energyKcal` 0 to attach no energy. */
  /** Resolves the saved HKWorkout's UUID. (A module from before #90: a boolean.) */
  saveWorkout(startedAt: number, endedAt: number, energyKcal: number): Promise<string | boolean | null>;
  hasWorkout(startedAt: number, endedAt: number): Promise<boolean>;
  findWorkout?(startedAt: number, endedAt: number): Promise<Record<string, unknown> | null>;
  canWriteWorkouts?(): boolean;
  replaceWorkout?(uuid: string, startedAt: number, endedAt: number): Promise<Record<string, unknown>>;
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
 * attaching `energyKcal` when a Watch measured it (pass 0 for none). `saved` is
 * false when Health is unavailable or the range is bad.
 *
 * `uuid` is the new entry's, kept so an edit to the workout's time can find it
 * again. Null with `saved` true only on a native module from before #90, which
 * reported the save as a bare boolean.
 */
export const saveWorkout = async (
  startedAt: number,
  endedAt: number,
  energyKcal = 0,
): Promise<{ saved: boolean; uuid: string | null }> => {
  if (!native) return { saved: false, uuid: null };
  const result = await native.saveWorkout(startedAt, endedAt, energyKcal);
  if (typeof result === 'string' && result.length > 0) return { saved: true, uuid: result };
  return { saved: result === true, uuid: null };
};

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

/**
 * Ischys's own strength HKWorkout covering this window — by the same rules as
 * `hasWorkout` — with its UUID and which half of Ischys wrote it. When both did,
 * the Watch's recording is the one returned.
 *
 * Null when there is none, when workout-read access was refused (HealthKit
 * reports that as no data), and on an older native module.
 */
export const findWorkout = async (
  startedAt: number,
  endedAt: number,
): Promise<FoundWorkout | null> => {
  if (!native || typeof native.findWorkout !== 'function') return null;
  try {
    const found = await native.findWorkout(startedAt, endedAt);
    if (!found || typeof found.uuid !== 'string') return null;
    if (found.writer !== 'phone' && found.writer !== 'watch') return null;
    return {
      uuid: found.uuid,
      startedAt: Number(found.startedAt),
      endedAt: Number(found.endedAt),
      energyKcal: Number(found.energyKcal) || 0,
      writer: found.writer,
      bundleId: typeof found.bundleId === 'string' ? found.bundleId : '',
    };
  } catch {
    return null;
  }
};

/**
 * Whether iOS lets Ischys write workouts. Unlike read access, HealthKit
 * discloses this one, so false is a real "no" — and also the answer on an older
 * native module, which could not replace an entry anyway.
 */
export const canWriteWorkouts = (): boolean => {
  if (!native || typeof native.canWriteWorkouts !== 'function') return false;
  try {
    return native.canWriteWorkouts();
  } catch {
    return false;
  }
};

/**
 * Moves an entry the PHONE wrote to a new start and end: HealthKit entries
 * cannot be edited, so it is deleted by UUID and saved again over the new
 * window, keeping its energy. An entry the Watch recorded is never touched —
 * that comes back as `notOurs`.
 *
 * Never throws: every way it can go wrong is a status.
 */
export const replaceWorkout = async (
  uuid: string,
  startedAt: number,
  endedAt: number,
): Promise<ReplaceWorkoutResult> => {
  if (!native || typeof native.replaceWorkout !== 'function') return { status: 'unavailable' };
  try {
    const result = await native.replaceWorkout(uuid, startedAt, endedAt);
    switch (result?.status) {
      case 'replaced':
        return typeof result.uuid === 'string'
          ? { status: 'replaced', uuid: result.uuid }
          : { status: 'failed' };
      case 'missing':
      case 'notOurs':
      case 'denied':
      case 'unavailable':
        return { status: result.status };
      default:
        return { status: 'failed' };
    }
  } catch {
    return { status: 'failed' };
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
  /**
   * The Watch confirming it saved this session's HKWorkout (see healthSync).
   * `uuid` is that HKWorkout's; absent from a Watch build that predates #90.
   */
  | { action: 'workoutSaved'; uuid?: string };

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
