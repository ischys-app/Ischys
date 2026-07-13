/**
 * Bridges Ischys workouts to Apple Health.
 *
 * The Health settings screen and the workout-finish flow both touch these keys,
 * so they live here once rather than in two places that can drift.
 */
import * as SecureStore from 'expo-secure-store';

import * as Health from '../../modules/health';
import { uploadHeartRate } from '../api/workouts';

// Plausible human heart-rate bounds. A stray sample outside this range is
// dropped rather than persisted.
const HR_MIN = 20;
const HR_MAX = 250;

export const HEALTH_KEYS = {
  connected: 'ischys.healthConnected',
  lastSync: 'ischys.healthLastSync',
  written: 'ischys.healthWorkoutsWritten',
  writeWorkouts: 'ischys.healthPref.writeWorkouts',
  readHR: 'ischys.healthPref.readHR',
  readBody: 'ischys.healthPref.readBody',
  readEnergy: 'ischys.healthPref.readEnergy',
} as const;

/** True once HealthKit is present and the user has answered the prompt. */
export function isHealthAvailable(): boolean {
  return Health.isAvailable();
}

/**
 * Shows the HealthKit permission sheet and records that the user connected.
 * Returns false when HealthKit is unavailable (Android, simulator, no build).
 *
 * "Connected" means "the user went through the prompt" — HealthKit refuses to
 * report write grants, so we cannot claim more. A denied write just no-ops.
 */
export async function connectHealth(): Promise<boolean> {
  if (!Health.isAvailable()) return false;
  const answered = await Health.requestAuthorization();
  if (!answered) return false;
  await SecureStore.setItemAsync(HEALTH_KEYS.connected, '1');
  await SecureStore.setItemAsync(HEALTH_KEYS.lastSync, new Date().toISOString());
  return true;
}

/** A pref defaults ON: only an explicit "0" disables it. */
const prefOn = (v: string | null): boolean => v !== '0';

/**
 * Reconciles a finished workout with Apple Health, if the user connected it.
 * Reads the metrics a Watch recorded for the session, saves the workout (with
 * energy) when writing is on, and uploads avg/max HR to the server when HR
 * reading is on.
 *
 * Best-effort throughout: it must never throw into the finish flow, so a Health
 * failure cannot stop a workout from being saved to the server.
 */
export async function syncFinishedWorkout(
  workoutId: string | null,
  startedAtMs: number,
  endedAtMs: number,
  /** True when the Watch ran the session — then IT wrote the HKWorkout (with HR
   *  and energy), so the phone must not write a duplicate. */
  watchRecorded = false,
): Promise<void> {
  try {
    if (!Health.isAvailable()) return;
    const [connected, writePref, hrPref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.writeWorkouts),
      SecureStore.getItemAsync(HEALTH_KEYS.readHR),
    ]);
    if (connected !== '1') return;

    const metrics = await Health.readWorkoutMetrics(startedAtMs, endedAtMs);

    if (prefOn(writePref)) {
      // The Watch is the sole writer when it recorded; otherwise the phone writes
      // the (energy-less, HR-less) workout itself.
      const saved = watchRecorded
        ? true
        : await Health.saveWorkout(startedAtMs, endedAtMs, metrics.energyKcal ?? 0);
      if (saved) {
        await SecureStore.setItemAsync(HEALTH_KEYS.lastSync, new Date().toISOString());
        const prev = Number(await SecureStore.getItemAsync(HEALTH_KEYS.written)) || 0;
        await SecureStore.setItemAsync(HEALTH_KEYS.written, String(prev + 1));
      }
    }

    // Persist HR aggregates so the summary and history carry them. Drop obviously
    // bogus readings: both values must be in range, and the average can't exceed
    // the max.
    if (
      prefOn(hrPref) &&
      workoutId &&
      metrics.avgHr != null &&
      metrics.maxHr != null &&
      metrics.avgHr >= HR_MIN &&
      metrics.avgHr <= HR_MAX &&
      metrics.maxHr >= HR_MIN &&
      metrics.maxHr <= HR_MAX &&
      metrics.avgHr <= metrics.maxHr
    ) {
      await uploadHeartRate(workoutId, { avg_hr: metrics.avgHr, max_hr: metrics.maxHr }).catch(
        () => {},
      );
    }
  } catch {
    // A Health failure must not break finishing a workout.
  }
}

/**
 * Starts the Watch's workout session (launching the Ischys Watch app) so heart
 * rate flows without the user touching the Watch — but only when they connected
 * Health and left HR reading on. Best-effort and silent with no Watch.
 */
export async function startWatchSession(): Promise<void> {
  if (!Health.isAvailable()) return;
  const [connected, hrPref] = await Promise.all([
    SecureStore.getItemAsync(HEALTH_KEYS.connected),
    SecureStore.getItemAsync(HEALTH_KEYS.readHR),
  ]);
  if (connected !== '1' || !prefOn(hrPref)) return;
  Health.startWatchWorkout();
}

/**
 * Ends the Watch session when the user finishes/discards. Harmless if none runs.
 * Pass `{ discard: true }` on a discard so the Watch drops its recording instead
 * of writing it to Apple Health.
 */
export function stopWatchSession(opts?: { discard?: boolean }): void {
  if (Health.isAvailable()) Health.stopWatchWorkout(opts?.discard ?? false);
}

/** Push the latest workout state to the Watch companion (no-op if unavailable). */
export function pushWatchState(state: Record<string, unknown>): void {
  if (Health.isAvailable()) Health.updateWatchState(state);
}

/** Subscribe to control taps from the Watch. */
export function onWatchAction(fn: (a: Health.WatchAction) => void): () => void {
  const sub = Health.addWatchActionListener(fn);
  return () => sub.remove();
}

/** Subscribe to live HR/energy streamed from the Watch. */
export function onWatchMetrics(fn: (m: { bpm: number; cal: number }) => void): () => void {
  const sub = Health.addWatchMetricsListener(fn);
  return () => sub.remove();
}

/**
 * Subscribes to live heart rate for the header chip, but only when the user has
 * connected Health and left HR reading on. Silent (no callback) unless an Apple
 * Watch is feeding HealthKit. Returns an unsubscribe; a no-op when not eligible.
 */
export function subscribeLiveHeartRate(onBpm: (bpm: number) => void): () => void {
  if (!Health.isAvailable()) return () => {};
  let stop: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const [connected, hrPref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.readHR),
    ]);
    if (cancelled || connected !== '1' || !prefOn(hrPref)) return;
    stop = Health.onHeartRate(onBpm);
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}
