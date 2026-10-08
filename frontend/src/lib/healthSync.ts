/**
 * Bridges Ischys workouts to Health: Apple Health on iOS, Health Connect on
 * Android. The comments below speak of HealthKit, where all of this began;
 * the Android module answers the same calls, and where it behaves differently
 * the comment says so.
 *
 * The Health settings screen and the workout-finish flow both touch these keys,
 * so they live here once rather than in two places that can drift.
 */
import * as SecureStore from 'expo-secure-store';

import * as Health from '../../modules/health';
import { listWorkouts, uploadHeartRate } from '../api/workouts';
import {
  getWorkoutHealthEntry,
  healthEntryHeldByAnother,
  setWorkoutHealthEntry,
} from '../data/healthEntryRepo';
import {
  entryAfterLookup,
  entryAfterReplace,
  entryAtFinish,
  healthReplacement,
  healthWindow,
  lookupAccepted,
  needsLookup,
  type HealthEditState,
  type PlannedWhen,
} from '../domain/healthEntry';
import { recordReadReceipt } from './healthReceipts';
import { setBodyweightKg } from './bodyweight';
import { watchSaveWaitMs } from './watchFinish';
import { parseServerDate } from './serverTime';
import { createWatchSaveLog } from './watchSave';
import {
  createWearSessionLog,
  parseWearSession,
  WEAR_SESSION_WAIT_MS,
  withWearSession,
  workoutForSession,
} from './wearSession';

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

/** True when Health exists on this device: HealthKit, or Health Connect. */
export function isHealthAvailable(): boolean {
  return Health.isAvailable();
}

/**
 * Shows the system's Health permission screen and records that the user
 * connected. Returns false when Health is unavailable (simulator, no build, an
 * Android without Health Connect).
 *
 * On iOS "connected" means "the user went through the prompt" — HealthKit
 * hides read grants, so we cannot claim more. A denied write just no-ops. On
 * Android it means they allowed at least one thing: Health Connect reports
 * every grant, and allowing nothing leaves nothing to be connected to.
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

// How long the phone waits for the Watch to confirm it saved the HKWorkout
// before writing the workout itself is `watchSaveWaitMs` (watchFinish.ts): it
// depends on whether the Watch has saved already or is waiting to be told the
// finish worked.

// The Watch's "saved its HKWorkout" confirmations, and the wait on them.
const watchSaves = createWatchSaveLog();
let watchSaveListening = false;

/**
 * Subscribe once (app-lifetime) to the Watch's save confirmation.
 *
 * A finish calls this before it writes to the database, and only syncs to
 * Health once that write has succeeded. A Watch that ended the session itself
 * (it could not reach the phone to ask, gave up waiting for the outcome, or
 * predates asking) confirms its save while the write is still running, and
 * with nothing listening yet that confirmation would be lost.
 */
export function ensureWatchSaveListener(): void {
  if (watchSaveListening) return;
  watchSaveListening = true;
  Health.addWatchActionListener((a) => {
    watchSaves.note(a);
    noteWearSession(a);
  });
}

// What a Wear OS watch's session measured (wearSession.ts): the counterpart of
// the Apple Watch's save confirmation above, heard by the same listener.
const wearSessions = createWearSessionLog();

/**
 * Takes in a Wear OS watch's `sessionMetrics`; ignores every other action.
 *
 * Recorded, for a finish that is waiting to write the workout to Health
 * Connect with its energy; and its heart rate stored on the workout at once.
 * At once, because the finish is not always there to do it: the numbers can
 * arrive after the finish has stopped waiting, before a finish that has not
 * happened yet, or at a launch with the workout long over.
 */
function noteWearSession(a: Health.WatchAction): void {
  const session = parseWearSession(a);
  if (!session) return;
  wearSessions.note(session);
  if (session.avgHr == null || session.maxHr == null) return;
  const hr = { avg_hr: session.avgHr, max_hr: session.maxHr };
  void (async () => {
    try {
      if (!prefOn(await SecureStore.getItemAsync(HEALTH_KEYS.readHR))) return;
      // Whatever its status: the Watch can end before the phone has finished.
      const recent = await listWorkouts({ limit: 20 });
      const id = workoutForSession(
        session,
        recent
          .filter((w) => w.status !== 'discarded')
          .map((w) => ({
            id: w.id,
            startedAt: parseServerDate(w.started_at),
            // A finished workout ended its length after it began.
            endedAt:
              w.status === 'active'
                ? null
                : parseServerDate(w.started_at) + w.duration_seconds * 1000,
          })),
        Date.now(),
      );
      if (id) await uploadHeartRate(id, hr);
    } catch {
      // The workout is stored either way; it just carries no heart rate.
    }
  })();
}

/**
 * Reconciles a finished workout with Apple Health, if the user connected it.
 * Reads the metrics a Watch recorded for the session, saves the workout (with
 * energy) when writing is on, records which Health entry is this workout's and
 * who wrote it (#90), and uploads avg/max HR to the server when HR reading is
 * on.
 *
 * Best-effort throughout: it must never throw into the finish flow, so a Health
 * failure cannot stop a workout from being saved to the server.
 */
export async function syncFinishedWorkout(
  workoutId: string | null,
  startedAtMs: number,
  endedAtMs: number,
  /** True when an Apple Watch ran the session. It's then the primary writer of
   *  the HKWorkout (with HR and energy) — but the phone verifies the save and
   *  writes the workout itself if the Watch never confirms, so a finished workout
   *  is never silently lost. */
  watchWasActive = false,
  /** When the finish began, if that was before this call (the database write
   *  comes first). A Watch confirmation from then on is this session's, so one
   *  that landed during the write still counts. For a finish drained at launch
   *  (`consumeWatchActions`) it is the drain's `heardAt` instead, so that a
   *  confirmation buffered alongside it counts too. */
  finishBeganAtMs = Date.now(),
  /** True when the Watch asked for this finish and is keeping its session
   *  running until it hears the outcome (#95). It then saves later than a
   *  Watch that was told to stop, or stopped itself, so the wait for its
   *  confirmation is longer (`watchSaveWaitMs`). */
  watchAwaitsOutcome = false,
  /** True when a Wear OS watch recorded the session. It saves nothing itself:
   *  it sends what it measured, and this waits a moment for that so the entry
   *  the phone writes carries the energy (`noteWearSession` has stored the
   *  heart rate by then, connected to Health or not). */
  wearWasActive = false,
): Promise<void> {
  try {
    // Before anything else, and whether or not Health is connected: the
    // numbers arrive about now and must not be missed.
    if (wearWasActive) ensureWatchSaveListener();
    if (!Health.isAvailable()) return;
    // Begin listening for the Watch's save confirmation immediately, before any
    // await, so a fast confirmation can't slip past while we read prefs/metrics.
    const finishedAt = finishBeganAtMs;
    let watchSavePromise: Promise<boolean> = Promise.resolve(false);
    if (watchWasActive) {
      ensureWatchSaveListener();
      watchSavePromise = watchSaves.wait(finishedAt, watchSaveWaitMs(watchAwaitsOutcome));
    }

    const [connected, writePref, hrPref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.writeWorkouts),
      SecureStore.getItemAsync(HEALTH_KEYS.readHR),
    ]);
    if (connected !== '1') return;

    const wearSession = wearWasActive
      ? await wearSessions.wait(startedAtMs, endedAtMs, WEAR_SESSION_WAIT_MS)
      : null;
    const metrics = withWearSession(
      await Health.readWorkoutMetrics(startedAtMs, endedAtMs),
      wearSession,
    );

    // Honest read-receipts: HealthKit hides read grants, so the Health screen
    // shows when data last actually ARRIVED instead of a fake granted/denied.
    // A metric coming back non-null here is a real read from HealthKit.
    if (metrics.avgHr != null && metrics.avgHr >= HR_MIN && metrics.avgHr <= HR_MAX) {
      await recordReadReceipt('readHR', `${Math.round(metrics.avgHr)} bpm`);
    }
    if (metrics.energyKcal != null && metrics.energyKcal > 0) {
      await recordReadReceipt('readEnergy', `${Math.round(metrics.energyKcal)} cal`);
    }

    if (prefOn(writePref)) {
      // The Watch owns the write only when it confirms it saved. If it was
      // recording but never confirms (auth failure, crash, an odd end), waiting
      // times out and the phone writes the (energy-less) workout itself rather
      // than lose it. With no Watch, the phone writes straight away.
      const watchSaved = await watchSavePromise;
      // A timeout is not proof the Watch failed to save — only that it failed to
      // say so in time, which is common: `workoutSaved` travels over
      // WatchConnectivity, and with the phone app not frontmost (the usual case
      // when the workout was ended FROM the Watch) it falls back to
      // `transferUserInfo` and is queued until the phone next runs. The
      // HKWorkout is already in Health by then and writing another puts the
      // session in Fitness twice. HealthKit is the authority, so ask it before
      // writing — and it also covers a phone-side sync that ran twice.
      //
      // The same question says which entry is this workout's. The Watch's own
      // message is the better answer when it has one: its UUID is exact, and it
      // does not depend on the recording having synced to this phone yet, which
      // can lag the confirmation. So Health is asked only when that is missing.
      const watchUuid = watchSaved ? watchSaves.uuid : null;
      const found =
        watchSaved && watchUuid ? null : await Health.findWorkout(startedAtMs, endedAtMs);
      // A write Health refuses outright rejects (on Android that includes the
      // user not allowing it). It must not skip the heart-rate upload below.
      const phoneSaved =
        watchSaved || found
          ? null
          : await Health.saveWorkout(startedAtMs, endedAtMs, metrics.energyKcal ?? 0).catch(
              () => null,
            );
      const entry = entryAtFinish({ watchConfirmed: watchSaved, watchUuid, found, phoneSaved });
      if (entry) {
        // Kept with the workout, so an edit to its time knows whether there is
        // an entry to move and whether it is Ischys's to move. Failing to
        // record it only means it is looked up later instead.
        if (workoutId) await setWorkoutHealthEntry(workoutId, entry).catch(() => {});
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

// --- editing a finished workout (#90) ----------------------------------------

/** A workout's time as stored: what its Health entry was written over. */
type StoredWhen = { startedAt: number; durationSeconds: number; endedAt: number | null };

const NO_HEALTH: HealthEditState = { connected: false, entry: null, canWrite: false };

// Everything that reads or writes a workout's Health entry for an edit runs
// one at a time, in the order it was asked for. A second save must see the
// UUID the first one stored, not the entry it has just deleted; and a lookup
// started when the edit screen opened must not finish after a save's replace
// and write the replaced entry's UUID back.
let healthEdits: Promise<unknown> = Promise.resolve();

function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = healthEdits.then(job);
  healthEdits = run.catch(() => {});
  return run;
}

/**
 * What an edit needs to know about a workout's Health entry: whether Health is
 * connected, which entry is the workout's and who wrote it, and whether Ischys
 * may write. domain/healthEntry.ts turns this into the Date & time sheet's line
 * and into whether Save replaces the entry.
 *
 * A workout finished before entries were recorded has nothing stored. Health
 * is then asked for Ischys's entry over the workout's stored window, and what
 * it holds is stored — if it can only be this workout's (`lookupAccepted`) —
 * so the question is asked once. `stored` must be the time as it was BEFORE
 * any edit: that is where the entry is.
 *
 * Takes its turn behind any replace still running, and reads what is stored
 * only then, so the newest stored value is the one it sees and keeps.
 *
 * Never throws; on any failure the answer is "no entry", which shows no line
 * and changes nothing.
 */
export function loadHealthEditState(
  workoutId: string,
  stored: StoredWhen,
): Promise<HealthEditState> {
  return inTurn(() => readHealthEditState(workoutId, stored));
}

/** `loadHealthEditState` itself. Only ever called from inside a turn. */
async function readHealthEditState(
  workoutId: string,
  stored: StoredWhen,
): Promise<HealthEditState> {
  try {
    if (!Health.isAvailable()) return NO_HEALTH;
    const [connected, writePref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.writeWorkouts),
    ]);
    if (connected !== '1') return NO_HEALTH;

    let entry = await getWorkoutHealthEntry(workoutId);
    if (needsLookup(entry)) {
      const window = healthWindow(stored);
      const found = window ? await Health.findWorkout(window.startedAt, window.endedAt) : null;
      // Overlapping the window is not enough to call an entry this workout's:
      // what is stored here is what a later edit moves.
      if (
        found &&
        lookupAccepted({
          workoutStartedAt: stored.startedAt,
          found,
          heldByAnother: await healthEntryHeldByAnother(found.uuid, workoutId),
        })
      ) {
        entry = entryAfterLookup(entry, found);
        await setWorkoutHealthEntry(workoutId, entry).catch(() => {});
      }
    }
    // Both switches: Ischys's own "write workouts" setting, and iOS's grant.
    return { connected: true, entry, canWrite: prefOn(writePref) && Health.canWriteWorkouts() };
  } catch {
    return NO_HEALTH;
  }
}

/**
 * Brings Apple Health in step with an edit that has ALREADY been committed.
 *
 * Only when the edit changed the date, the start or the duration, the entry is
 * one the phone wrote, and writing is allowed: that entry is replaced with one
 * over the new start and end, and its new UUID stored. A Watch recording, a
 * denied write, and every edit to sets alone leave Health exactly as it is.
 * So does a replace that could not be carried out — Health not answering on a
 * locked phone, say: the entry stays on record and the next edit to the
 * workout's time tries again.
 *
 * Best-effort, like the finish path: it never throws, and nothing it does or
 * fails to do can undo the save that came before it.
 *
 * `stored` is the workout's time before the edit; `plan` the edit's time fields.
 */
export function syncEditedWorkout(
  workoutId: string,
  stored: StoredWhen,
  plan: PlannedWhen,
): Promise<void> {
  // Set edits never touch Health, and never ask it anything either.
  if (plan.endedAt == null) return Promise.resolve();
  return inTurn(async () => {
    try {
      const state = await readHealthEditState(workoutId, stored);
      const target = healthReplacement(state, plan, stored);
      if (!target || !state.entry) return;
      const outcome = await Health.replaceWorkout(target.uuid, target.startedAt, target.endedAt);
      await setWorkoutHealthEntry(workoutId, entryAfterReplace(state.entry, outcome));
      if (outcome.status === 'replaced') {
        await SecureStore.setItemAsync(HEALTH_KEYS.lastSync, new Date().toISOString());
      }
    } catch {
      // A Health failure must not surface as a failed edit.
    }
  });
}

/**
 * Refresh the stored bodyweight from Apple Health, when the user connected it.
 *
 * Bodyweight feeds volume for bodyweight movements, and having connected Health
 * is a clear signal they'd rather not retype it — so this keeps the setting in
 * step with Health instead of leaving it to a manual pull. A manual entry still
 * wins until Health has a newer reading, because Health is what changes.
 *
 * Best-effort and silent: no Health, no connection, or no logged weight all just
 * leave the existing value alone. Never call this inside a DB transaction — it
 * awaits SecureStore/HealthKit, which hangs expo-sqlite.
 */
export async function syncBodyweightFromHealth(): Promise<number | null> {
  try {
    if (!Health.isAvailable()) return null;
    const connected = await SecureStore.getItemAsync(HEALTH_KEYS.connected);
    if (connected !== '1') return null;
    const kg = await Health.readBodyMass();
    if (kg == null) return null;
    await setBodyweightKg(kg);
    return kg;
  } catch {
    return null;
  }
}

/**
 * Starts the Watch's workout session (launching the Ischys Watch app) so heart
 * rate flows without the user touching the Watch — but only when they connected
 * Health and left HR reading on. Best-effort and silent with no Watch.
 */
export async function startWatchSession(): Promise<void> {
  if (!Health.isWatchAvailable()) return;
  // A Wear OS watch streams over its own link, so it does not wait on a
  // Health Connect connection the way the Apple Watch waits on HealthKit.
  if (Health.watchNeedsHealth()) {
    const [connected, hrPref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.readHR),
    ]);
    if (connected !== '1' || !prefOn(hrPref)) return;
  }
  Health.startWatchWorkout();
}

/**
 * Ends the Watch session when the user finishes/discards. Harmless if none runs.
 * Pass `{ discard: true }` on a discard so the Watch drops its recording instead
 * of writing it to Apple Health.
 */
export function stopWatchSession(opts?: { discard?: boolean }): void {
  if (Health.isWatchAvailable()) Health.stopWatchWorkout(opts?.discard ?? false);
}

/**
 * Push the latest workout state to the Watch companion (no-op if unavailable).
 *
 * The accent rides along on every push rather than through a channel of its
 * own: the Watch caches it, so one field here keeps the wrist in step without
 * any extra plumbing.
 */
export function pushWatchState(state: Record<string, unknown>): void {
  if (!Health.isWatchAvailable()) return;
  Health.updateWatchState({ themeId: currentThemeId, ...state });
}

/** Mirrors the phone's accent onto pushes; set once at startup. */
let currentThemeId = 'ember';
export function setWatchThemeId(id: string): void {
  currentThemeId = id;
}

/**
 * Watch actions that arrived before JS was listening — the cold-launch window,
 * where WCSession can deliver a queued finish while the bundle is still loading.
 * Drained once from the root layout. Empty when Health is unavailable.
 *
 * The Watch's "saved" confirmation is buffered there as well and is recorded
 * here, since nothing else would hear it. `heardAt` is the instant a finish
 * among `actions` must pass to `syncFinishedWorkout` as its beginning, for that
 * confirmation to count as its own (see `noteDrained` in watchSave.ts).
 */
export async function consumeWatchActions(): Promise<{
  actions: Health.WatchAction[];
  heardAt: number;
}> {
  // Taken before the drain, which is what turns live delivery on: anything
  // that arrives live from here on is stamped later than this.
  const heardAt = Date.now();
  if (!Health.isWatchAvailable()) return { actions: [], heardAt };
  // Listening first, for the same reason: a confirmation sent live the moment
  // the drain returns must find a listener.
  ensureWatchSaveListener();
  const actions = await Health.consumeWatchActions();
  watchSaves.noteDrained(actions, heardAt);
  // A Wear OS watch's numbers for a session that ended with the app closed.
  for (const a of actions) noteWearSession(a);
  return { actions, heardAt };
}

/**
 * Pulls waist and body fat from Health into the measurement history.
 *
 * Only when the user connected Health and left body reading on — the same
 * intent/receipt rule the rest of this module follows. Upserts by the sample's
 * uuid, so running it repeatedly converges rather than accumulating.
 */
export async function syncBodyMeasurementsFromHealth(): Promise<number> {
  try {
    if (!Health.isAvailable()) return 0;
    const connected = await SecureStore.getItemAsync(HEALTH_KEYS.connected);
    if (connected !== '1') return 0;

    const found = await Health.readBodyMeasurements();
    const entries = Object.entries(found);
    if (entries.length === 0) return 0;

    const { upsertHealthMeasurement } = await import('../data/measurementsRepo');
    for (const [metric, r] of entries) {
      if (metric !== 'waist' && metric !== 'bodyFat') continue;
      await upsertHealthMeasurement(metric, r.value, Math.round(r.measuredAt), r.uuid);
    }
    // A value arriving IS the receipt — the Health screen shows when data last
    // actually came back rather than a permission the system will not disclose.
    await recordReadReceipt('readBody', `${entries.length} reading${entries.length === 1 ? '' : 's'}`);
    return entries.length;
  } catch {
    return 0;
  }
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
  // Stamp a read-receipt on the first live sample only — the screen wants "last
  // received", not a write per beat hammering SecureStore.
  let receiptStamped = false;

  void (async () => {
    const [connected, hrPref] = await Promise.all([
      SecureStore.getItemAsync(HEALTH_KEYS.connected),
      SecureStore.getItemAsync(HEALTH_KEYS.readHR),
    ]);
    if (cancelled || connected !== '1' || !prefOn(hrPref)) return;
    stop = Health.onHeartRate((bpm) => {
      if (!receiptStamped && bpm >= HR_MIN && bpm <= HR_MAX) {
        receiptStamped = true;
        void recordReadReceipt('readHR', `${Math.round(bpm)} bpm`);
      }
      onBpm(bpm);
    });
  })();

  return () => {
    cancelled = true;
    stop?.();
  };
}
