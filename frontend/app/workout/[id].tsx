/**
 * Active Workout — the core logging screen. Built from Active Workout.dc.html.
 * Loads/persists to the local store when given a real workout id; falls back
 * to a local-only demo seed for id === 'demo' (or if the load fails).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as LiveActivity from '../../modules/live-activity';
import { haptics, setHapticsEnabled } from '../../src/lib/haptics';
import { buildLiveActivityState } from '../../src/lib/liveActivityState';

import type {
  PreviousSetOut,
  WorkoutExerciseOut,
  WorkoutOut,
} from '../../src/api/types';
import {
  addSetApi,
  addWorkoutExercise,
  deleteSet as deleteSetApi,
  getSettings,
  discardWorkout,
  finishWorkout,
  insertWarmupSets,
  nextSupersetGroup,
  setSupersetGroup,
  listExerciseUsage,
  getPrevious,
  getPreviousNote,
  setWorkoutExerciseNote as setNoteApi,
  setWorkoutExerciseRest as setRestApi,
  getWorkout,
  patchSet as patchSetApi,
  removeWorkoutExercise,
  reorderExercises,
} from '../../src/api/workouts';
import { takePendingSelection } from '../../src/lib/pendingSelection';
import { replaceOrder, swapExercise } from '../../src/lib/replaceExercise';
import { elapsedSeconds, restRemainingSeconds } from '../../src/lib/clocks';
import { locateNextSet } from '../../src/lib/nextSet';
import {
  forgetLiveActivityHint,
  liveActivityHintShown,
  rememberLiveActivityHint,
} from '../../src/lib/liveActivityHint';
import { parseServerDate } from '../../src/lib/serverTime';
import {
  forgetActiveWorkout,
  rememberActiveWorkout,
} from '../../src/lib/activeWorkout';
import { saveRest, loadRest, clearRest } from '../../src/lib/restSession';
import { onRestAction, onWorkoutChanged, type RestAction } from '../../src/lib/liveActivityBridge';
import type { ExerciseOut } from '../../src/api/types';
import { saveSummary } from '../../src/lib/summaryCache';
import {
  ensureWatchSaveListener,
  onWatchAction,
  onWatchMetrics,
  pushWatchState,
  startWatchSession,
  stopWatchSession,
  subscribeLiveHeartRate,
  syncBodyweightFromHealth,
  syncFinishedWorkout,
} from '../../src/lib/healthSync';
import { buildFinishedWatchState, buildWatchState } from '../../src/lib/watchState';
import {
  claimWatchFinish,
  finishRequestId,
  watchAwaitingFinish,
  withFinishVerdict,
} from '../../src/lib/watchFinish';
import { PlateSheet } from '../../src/components/workout/PlateSheet';
import { WarmupSheet } from '../../src/components/workout/WarmupSheet';
import { SupersetSheet } from '../../src/components/workout/SupersetSheet';
import type { RampRow } from '../../src/domain/warmupRamp';
import { getPlateSetup } from '../../src/lib/plateSetup';
import {
  DEFAULT_BAR_SETUP,
  setupUnit,
  smallestStepKg,
  type BarSetup,
} from '../../src/domain/plateMath';
import { suggestNextSet } from '../../src/domain/progression';
import {
  WEIGHT_STEPS,
  convertWeightText,
  inputToKg,
  volumeToDisplay,
  weightText,
  type Unit,
} from '../../src/domain/units';
import { useWeightUnit } from '../../src/lib/weightUnit';
import { shouldPromptEffort } from '../../src/domain/effort';
import { useEffortMode } from '../../src/lib/effortMode';
import { EffortSheet } from '../../src/components/workout/EffortSheet';
import { deloadActiveFor, getDeloadState, type DeloadState } from '../../src/lib/deloadState';
import { groupLabels, restAfterSet, roundOfSet } from '../../src/domain/supersets';
import { getBodyweightKg } from '../../src/lib/bodyweight';
import { getCountWarmups } from '../../src/lib/warmupVolume';
import type { WatchAction } from '../../modules/health';
import { color, font } from '../../src/theme/tokens';
import { CheckIcon } from '../../src/components/icons';
import { EmptyWorkout } from '../../src/components/workout/EmptyWorkout';
import { ExerciseCard } from '../../src/components/workout/ExerciseCard';
import { ReorderExercises } from '../../src/components/workout/ReorderExercises';
import { EffortSection, RestBar } from '../../src/components/workout/RestBar';
import { DraggableSheet } from '../../src/components/DraggableSheet';
import { PressableScale } from '../../src/components/PressableScale';
import { RestPickerSheet } from '../../src/components/workout/RestPickerSheet';
import { carryFor, completionPatch, resolveSet } from '../../src/components/workout/setCarry';
import {
  cancelRestAlert,
  ensureAlertPermission,
  installRestAlertHandler,
  maybeAskForExactAlarms,
  scheduleRestAlert,
  shouldSchedule,
} from '../../src/lib/restAlert';
import { WorkoutHeader } from '../../src/components/workout/WorkoutHeader';
import {
  fmtClock,
  makeSet,
  seedWorkout,
  setBadge,
  TYPE_CYCLE,
  type Exercise,
} from '../../src/components/workout/types';

const START_ELAPSED = 12 * 60 + 47; // seeded "12:47"
const DEFAULT_REST = 120;

/** Server number → input string ('' for null). */
const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));

/**
 * Map a stored WorkoutExerciseOut (+ optional previous-session sets) to the
 * local model. Stored weights are kilograms; the model's strings are in `unit`.
 */
function mapExercise(
  we: WorkoutExerciseOut,
  prev: PreviousSetOut[],
  prevNote: string | null,
  unit: Unit,
): Exercise {
  const prevByPos = new Map(prev.map((p) => [p.position, p]));
  return {
    id: we.id, // local id = workout_exercise id
    exerciseCatalogId: we.exercise.id,
    name: we.exercise.name,
    initials: we.exercise.initials,
    equipment: we.exercise.equipment,
    kind: we.exercise.kind,
    rest: we.rest_seconds,
    supersetGroup: we.superset_group ?? null,
    note: we.note ?? '',
    notePlaceholder: prevNote ?? undefined,
    sets: we.sets.map((s) => {
      const p = prevByPos.get(s.position);
      return {
        id: s.id,
        type: s.type,
        weight: weightText(s.weight, unit),
        reps: numStr(s.reps),
        prevWeight: p?.weight == null ? undefined : weightText(p.weight, unit),
        prevReps: p?.reps == null ? undefined : String(p.reps),
        done: s.done,
        // Loaded whatever the setting says: Off hides ratings, it does not
        // drop them, and the setting can be switched while this screen is open.
        rpe: s.rpe ?? null,
        prevRpe: p?.rpe ?? null,
      };
    }),
  };
}

export default function ActiveWorkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isDemo = routeId === 'demo' || !routeId;

  const [exercises, setExercises] = useState<Exercise[]>(() =>
    isDemo ? seedWorkout() : [],
  );
  // The user's weight unit, and the unit the weight strings in `exercises` are
  // currently written in. They are separate on purpose: the preference can flip
  // while this screen sits under Settings, and for a moment the strings are
  // still in the old unit. Everything below — labels, volume, every write to
  // storage — reads `entryUnit`, so a number is never shown or stored under a
  // unit it was not typed in. `entryUnit` only ever changes in the same update
  // that rewrites the strings (see the unit-switch effect further down). The
  // demo seed is written in kilograms, hence the initial value.
  const unit = useWeightUnit();
  const unitRef = useRef(unit);
  unitRef.current = unit;
  const [entryUnit, setEntryUnit] = useState<Unit>('kg');
  const [workoutId, setWorkoutId] = useState<string | null>(isDemo ? null : routeId);
  const [persist, setPersist] = useState(!isDemo);
  const [name, setName] = useState(isDemo ? 'Upper' : '');
  const [status, setStatus] = useState<string>('active');
  const [elapsed, setElapsed] = useState(START_ELAPSED);
  /** Epoch ms the workout began. The elapsed clock is derived from this. */
  const [startedAt, setStartedAt] = useState<number | null>(
    isDemo ? Date.now() - START_ELAPSED * 1000 : null,
  );
  /** The first load is in flight — render a skeleton, not "no exercises". */
  const [loading, setLoading] = useState(!isDemo);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restTotal, setRestTotal] = useState(DEFAULT_REST);
  // Height of the on-screen keyboard, so we can float a "Done" bar just above it.
  // The numeric keypads have no return key, so this is the only dismiss affordance
  // — and InputAccessoryView does not render under the New Architecture.
  const [kbHeight, setKbHeight] = useState(0);
  // Which set the keyboard toolbar is acting on. The toolbar is one bar for the
  // whole screen, so it can only offer Plates once it knows whose weight is
  // being typed — and whether that exercise is even loaded with plates.
  const [focusedSet, setFocusedSet] = useState<{
    exerciseId: string;
    setId: string;
    field: 'weight' | 'reps';
  } | null>(null);
  // Effort per set (#84). 'off' for most people, and then nothing below that
  // mentions effort renders or runs: no prompt, no row line, no keypad key.
  const effortMode = useEffortMode();
  // The set the rest bar is asking about: the one whose tick started the rest
  // that is running. `saved` once it was rated from there, which folds the
  // question away. Gone when the rest ends or another rest starts.
  const [effortPrompt, setEffortPrompt] = useState<{
    exerciseId: string;
    setId: string;
    saved: boolean;
  } | null>(null);
  // The set whose rating sheet is open (from its row).
  const [effortSheet, setEffortSheet] = useState<{ exerciseId: string; setId: string } | null>(null);
  // The set the keypad bar is rating: its RPE key swaps the bar for the scale,
  // in place, so the keypad stays up. A sheet here would be a Modal, and
  // presenting one drops the keyboard.
  const [keypadEffortSetId, setKeypadEffortSetId] = useState<string | null>(null);
  // How much taller the effort section makes the rest card, as measured.
  const [restEffortHeight, setRestEffortHeight] = useState(0);
  const [plateSheetOpen, setPlateSheetOpen] = useState(false);
  const [warmupExId, setWarmupExId] = useState<string | null>(null);
  const [supersetExId, setSupersetExId] = useState<string | null>(null);
  const [plateSetup, setPlateSetupState] = useState<BarSetup>(DEFAULT_BAR_SETUP);
  // When each exercise was last trained, for the progression suggestion's
  // staleness rule. One grouped query, not one per exercise.
  const [lastTrained, setLastTrained] = useState<Map<string, number>>(new Map());
  const [deload, setDeload] = useState<DeloadState | null>(null);
  // Absolute bounds of the current rest, mirroring `restRemaining` for the Live
  // Activity: the widget ticks itself from these while the app is suspended, so
  // they change only when rest starts, is adjusted, or ends — never on the tick.
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  // Which exercise's rest is running, so changing that exercise's duration can
  // retime it. `null` for a manually-started rest, which belongs to no exercise.
  const [restExId, setRestExId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [restSheetExId, setRestSheetExId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // The rest alert is a scheduled notification, not an in-app sound: the JS timer
  // stops the moment iOS suspends the app, which is most of a real rest period.
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  // The bare `rest_timer_alerts` setting, for the Watch. Not `alertsEnabled`:
  // that also needs notification permission, which the wrist's own haptic does
  // not — declining the prompt should not silence the Watch.
  const [restAlertsSetting, setRestAlertsSetting] = useState(false);
  const restAlertId = useRef<string | null>(null);
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  // Live heart rate from a recording Apple Watch, via HealthKit. Null until a
  // real sample arrives, so the header chip stays hidden with no Watch — never
  // an invented number. `subscribeLiveHeartRate` self-gates on the connect +
  // read-HR preferences and is silent otherwise.
  const [heartRate, setHeartRate] = useState<number | null>(null);
  // Live active energy the Watch streams alongside HR (was previously dropped).
  const [activeCal, setActiveCal] = useState<number | null>(null);
  // Current bodyweight (kg) for live volume of bodyweight movements; null until
  // loaded / unset, in which case they contribute 0 (unchanged behaviour).
  const [bwKg, setBwKg] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      // Refresh from Health first when it's connected, so a weight logged there
      // is reflected in this session's volume without retyping it.
      await syncBodyweightFromHealth();
      setBwKg(await getBodyweightKg());
    })();
  }, []);
  // Whether warmup sets count toward volume (Settings toggle, default off). Loaded
  // once; the live header + watch mirror both respect it.
  const [countWarmups, setCountWarmups] = useState(false);
  useEffect(() => {
    void getCountWarmups().then(setCountWarmups);
  }, []);
  // True once the Watch streams metrics — it was then recording, so at finish the
  // phone lets the Watch be the primary HKWorkout writer and backfills only if the
  // Watch never confirms the save (see syncFinishedWorkout).
  const watchRecordedRef = useRef(false);
  useEffect(() => {
    if (isDemo) return;
    // Launch the Watch app into a session (needs WKBackgroundModes:
    // workout-processing on the Watch) and read the live BPM it streams into
    // HealthKit. The Watch's own Start button remains a fallback.
    void startWatchSession();
    return subscribeLiveHeartRate(setHeartRate);
  }, [isDemo]);

  // Load a real workout on mount; fall back to the offline demo seed on failure.
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    (async () => {
      let w: WorkoutOut;
      try {
        w = await getWorkout(routeId);
      } catch {
        if (cancelled) return;
        setExercises(seedWorkout());
        setEntryUnit('kg'); // the seed is written in kilograms
        setPersist(false); // load failed → offline, don't write back
        setName('Upper');
        setStartedAt(Date.now() - START_ELAPSED * 1000);
        setLoading(false);
        return;
      }
      // Best-effort previous-session hints (sets + note), in parallel; failures → empty.
      const [prev, prevNotes] = await Promise.all([
        Promise.all(w.exercises.map((we) => getPrevious(w.id, we.id).catch(() => [] as PreviousSetOut[]))),
        Promise.all(w.exercises.map((we) => getPreviousNote(we.id).catch(() => null))),
      ]);
      if (cancelled) return;
      setWorkoutId(w.id);
      setName(w.name);
      setStatus(w.status);
      setStartedAt(parseServerDate(w.started_at));
      setElapsed(w.duration_seconds);
      // Stored kilograms -> strings in the unit preferred right now, and
      // `entryUnit` moved with them in the same update.
      const loadedIn = unitRef.current;
      setExercises(w.exercises.map((we, i) => mapExercise(we, prev[i], prevNotes[i], loadedIn)));
      setEntryUnit(loadedIn);
      // Restore an in-flight rest countdown if the screen was unmounted (minimise
      // / navigate away) or the app was killed mid-rest. The countdown is derived
      // from the stored absolute end timestamp, so it's correct however long we
      // were gone.
      const savedRest = loadRest(w.id);
      if (savedRest) {
        setRestTotal(savedRest.total);
        setRestEndsAt(savedRest.endsAt);
        setRestStartedAt(savedRest.endsAt - savedRest.total * 1000);
        setRestExId(savedRest.exerciseId);
        setRestRemaining(restRemainingSeconds(savedRest.endsAt, Date.now()));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo, routeId]);

  // Reopen here after a relaunch. Cleared the moment the user chooses to leave.
  useEffect(() => {
    if (!persist || !workoutId) return;
    if (status === 'active') rememberActiveWorkout(workoutId);
    else forgetActiveWorkout();
  }, [persist, workoutId, status]);

  /** Pull the stored workout into local state. No-op for the offline demo seed. */
  const refresh = useCallback(async () => {
    if (isDemo || !persist) return;
    try {
      // Land every optimistic/debounced write BEFORE reading the store back —
      // otherwise the refetch returns state that predates them and wipes the
      // change from the screen (see `write`/`settleWrites`).
      await flushPending();
      await settleWrites();
      const w = await getWorkout(routeId);
      const [prev, prevNotes] = await Promise.all([
        Promise.all(w.exercises.map((we) => getPrevious(w.id, we.id).catch(() => [] as PreviousSetOut[]))),
        Promise.all(w.exercises.map((we) => getPreviousNote(we.id).catch(() => null))),
      ]);
      setName(w.name);
      setStatus(w.status);
      setStartedAt(parseServerDate(w.started_at));
      const loadedIn = unitRef.current;
      setExercises(w.exercises.map((we, i) => mapExercise(we, prev[i], prevNotes[i], loadedIn)));
      setEntryUnit(loadedIn);
    } catch {
      // best-effort refresh — swallow errors so we don't clobber local state
    }
  }, [isDemo, persist, routeId]);

  // Refetch the workout whenever this screen regains focus (e.g. after picking
  // exercises in the Exercise Library modal). No-op for the offline demo seed.
  const isInitialFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // Returning from the library in replace mode. Drained before the initial-
      // focus guard so a pick is never left sitting in the global slot.
      const target = replaceTarget.current;
      replaceTarget.current = null;
      const picked = target ? (takePendingSelection()?.[0] ?? null) : null;

      if (isInitialFocus.current) {
        isInitialFocus.current = false;
        return;
      }
      if (isDemo || !persist) {
        if (target && picked) void applyReplace.current(target, picked);
        return;
      }
      (async () => {
        if (target && picked) await applyReplace.current(target, picked);
        await refresh();
      })();
    }, [isDemo, persist, routeId]),
  );

  // Fire-and-forget write; failures are swallowed so local state never blocks.
  // Tracked so `refresh` can wait for them: a refetch that overtakes an in-flight
  // write reads the store *before* it lands and replaces local state without the
  // change — which made a set added during rest flash and vanish (the Live
  // Activity appearing blips AppState, and that fires a refresh).
  const inFlight = useRef(new Set<Promise<unknown>>());
  const write = (p: Promise<unknown>) => {
    inFlight.current.add(p);
    void p.catch(() => {}).finally(() => inFlight.current.delete(p));
  };

  /** Let every queued write land, so a refetch can't read a stale store. */
  const settleWrites = async () => {
    // Writes can enqueue more writes, so drain until the set is empty.
    while (inFlight.current.size > 0) {
      await Promise.allSettled([...inFlight.current]);
    }
  };

  // Debounced per-field persistence (weight/reps text edits). Each pending entry
  // keeps its write thunk so we can FLUSH it (fire it now) rather than only cancel
  // — otherwise finishing or leaving within the debounce window drops the write.
  const pendingRef = useRef<Record<string, { timer: ReturnType<typeof setTimeout>; run: () => Promise<unknown> }>>({});
  const debounce = (key: string, run: () => Promise<unknown>, delay = 600) => {
    const pending = pendingRef.current;
    if (pending[key]) clearTimeout(pending[key].timer);
    pending[key] = {
      run,
      timer: setTimeout(() => {
        delete pendingRef.current[key];
        write(run());
      }, delay),
    };
  };
  /** Fire every pending debounced write now and await them — before finishing/leaving. */
  const flushPending = async () => {
    const runs = Object.values(pendingRef.current).map((p) => {
      clearTimeout(p.timer);
      return p.run();
    });
    pendingRef.current = {};
    await Promise.allSettled(runs);
  };
  useEffect(() => {
    // On unmount (e.g. Back mid-edit), flush pending writes instead of dropping them.
    return () => {
      void flushPending();
    };
  }, []);

  // The unit was switched while this workout is open (Settings sits on top of
  // this screen, which stays mounted). Bring the strings over to the new unit.
  //
  // A stored workout is simply re-read: `refresh` first lands any pending edits
  // — each already converted to kilograms when it was typed, under the unit it
  // was typed in — and then rebuilds every string from those kilograms. Nothing
  // is rounded twice, so 225 lb comes back as 225 however often the unit flips.
  // Until that lands the screen goes on showing the old unit, labels and all.
  //
  // Only the offline demo, which has no stored copy, converts its text in place.
  useEffect(() => {
    if (loading || unit === entryUnit) return;
    if (!isDemo && persist) {
      void refresh();
      return;
    }
    setExercises((prev) =>
      prev.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) => ({
          ...s,
          weight: convertWeightText(s.weight, entryUnit, unit),
          prevWeight:
            s.prevWeight == null ? undefined : convertWeightText(s.prevWeight, entryUnit, unit),
        })),
      })),
    );
    setEntryUnit(unit);
  }, [unit, entryUnit, loading, isDemo, persist, refresh]);

  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const startedAtRef = useRef(startedAt);
  startedAtRef.current = startedAt;
  const restEndsRef = useRef(restEndsAt);
  restEndsRef.current = restEndsAt;

  /**
   * Both clocks are *derived* from absolute timestamps, never incremented.
   *
   * A JS interval stops the moment iOS suspends the app, so a counter that ticks
   * upward silently loses however long you were away — which is most of a real
   * workout, and why the app's clock disagreed with the card's. The Live
   * Activity renders from Dates and never drifts; recomputing from `startedAt`
   * and `restEndsAt` means a resumed app is correct again immediately.
   */
  const syncClocks = useCallback(() => {
    const now = Date.now();
    if (startedAtRef.current != null) setElapsed(elapsedSeconds(startedAtRef.current, now));
    if (restEndsRef.current != null) {
      setRestRemaining(restRemainingSeconds(restEndsRef.current, now));
    }
  }, []);

  useEffect(() => {
    const t = setInterval(syncClocks, 1000);
    // A suspended app misses ticks; resync on foreground rather than showing a
    // stale clock for up to a second.
    const resumed = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncClocks();
    });
    return () => {
      clearInterval(t);
      resumed.remove();
    };
  }, [syncClocks]);

  // Track keyboard height (iOS) to float the Done bar above it.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => {
      setKbHeight(0);
      setKeypadEffortSetId(null); // the next keypad opens on its normal bar
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Rest that runs out on its own leaves the bounds behind; drop them so the
  // card falls back to logging rather than showing an expired countdown.
  useEffect(() => {
    if (restRemaining === 0 && restEndsAt != null) {
      setRestStartedAt(null);
      setRestEndsAt(null);
      setRestExId(null);
      setEffortPrompt(null); // the question goes when the rest does
      if (workoutId) clearRest(workoutId); // the rest is over — don't restore it
      haptics.commit(); // rest's up
    }
  }, [restRemaining, restEndsAt]);

  // Persist the in-flight rest so leaving the screen (minimise / navigate away)
  // or a mid-rest app kill can restore the countdown on return — it otherwise
  // lives only in this component's state. Only *saved* here; the rest is cleared
  // explicitly when it's skipped, ends, or the workout is finished/discarded, so
  // this effect firing with no rest on mount can't wipe a rest we're about to
  // restore.
  useEffect(() => {
    if (!persist || !workoutId || restEndsAt == null) return;
    saveRest(workoutId, { endsAt: restEndsAt, total: restTotal, exerciseId: restExId });
  }, [persist, workoutId, restEndsAt, restTotal, restExId]);

  // The Lock Screen card. Memoised on the state it actually shows, so the 1 Hz
  // tick cannot push an ActivityKit update every second — the widget's own
  // `timerInterval:` handles the countdown between our updates.
  const resting = restRemaining > 0;
  const liveActivity = useMemo(
    () =>
      buildLiveActivityState(
        exercises,
        resting,
        (sets, i) => resolveSet(sets[i], carryFor(sets, i)),
        entryUnit,
      ),
    [exercises, resting, entryUnit],
  );

  const activityRunning = useRef(false);

  useEffect(() => {
    if (!LiveActivity.isSupported()) return;

    // Every set done: nothing useful left to show.
    if (!liveActivity) {
      if (activityRunning.current) {
        activityRunning.current = false;
        void LiveActivity.end();
      }
      return;
    }

    const state = {
      ...liveActivity,
      restStartedAt: restStartedAt ?? undefined,
      restEndsAt: restEndsAt ?? undefined,
    };

    if (activityRunning.current) {
      void LiveActivity.update(state);
      return;
    }
    // Attributes are fixed for the Activity's life, so the origin is pinned once
    // here — from the stored started_at, the same source the elapsed clock uses.
    if (startedAtRef.current == null) return;
    activityRunning.current = LiveActivity.start(startedAtRef.current, state) != null;
    // `startedAt` arrives with the loaded workout, after the first run — without
    // it in the deps the card would never start.
  }, [liveActivity, restStartedAt, restEndsAt, startedAt]);

  /**
   * Say once, at the start of a workout, when Live Activities are switched off
   * for Ischys — iOS does that by itself after a card is dismissed, `start()`
   * then quietly returns nil, and nothing else in the app reveals why the Lock
   * Screen stayed empty (#29). `isAvailable()` keeps this to the case the user
   * can actually act on: an iPhone too old for Live Activities gets no hint.
   */
  const liveActivityChecked = useRef(false);
  useEffect(() => {
    if (!liveActivity || liveActivityChecked.current) return;
    if (!LiveActivity.isAvailable()) return;
    liveActivityChecked.current = true;

    if (LiveActivity.isSupported()) {
      // On: re-arm, so a future switch-off earns one fresh reminder.
      forgetLiveActivityHint();
      return;
    }
    if (liveActivityHintShown()) return;
    rememberLiveActivityHint();
    Alert.alert(
      'Live Activities are off',
      'Turn on Live Activities for Ischys in Settings to see your rest timer on the Lock Screen.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => {}) },
      ],
    );
  }, [liveActivity]);

  // Re-show the Live Activity if the user swiped it away. iOS ends a dismissed
  // card but we still think it runs, so on return to foreground we ask the
  // native side whether one is actually live and restart it if not — as long as
  // the workout still has something to show.
  //
  // The `isSupported` check is inside the listener, not around it: coming back
  // from Settings having just switched Live Activities back on IS a foreground
  // transition, and a check outside would have been made while they were still
  // off and would have skipped registering entirely.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      if (!LiveActivity.isSupported()) return;
      if (!liveActivity || startedAtRef.current == null) return;
      if (LiveActivity.isActive()) return;
      const state = {
        ...liveActivity,
        restStartedAt: restStartedAt ?? undefined,
        restEndsAt: restEndsAt ?? undefined,
      };
      activityRunning.current = LiveActivity.start(startedAtRef.current, state) != null;
    });
    return () => sub.remove();
  }, [liveActivity, restStartedAt, restEndsAt]);

  // Card buttons are drained at the root layout, because an intent can launch
  // the app in the background with this screen unmounted. Sets are written
  // there; here we only mirror rest, which lives in this component's state,
  // and refetch once the writes have landed.
  const applyRestAction = useRef<(action: RestAction) => void>(() => {});
  applyRestAction.current = (action) => {
    if (action.type === 'skip') {
      endRest();
      return;
    }
    adjustRest(action.seconds);
  };

  // Held in refs: these listeners are registered once and must not close over a
  // stale `refresh` or stale exercises.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const offRest = onRestAction((a) => applyRestAction.current(a));

    // A ✓ from the card starts that exercise's rest, exactly as the in-app ✓
    // does. Refetch FIRST: our state still shows the set as undone, so naming
    // the "next" exercise before the write lands picks the wrong one — and the
    // set itself would keep rendering unchecked.
    const offChange = onWorkoutChanged(async (rest) => {
      await refreshRef.current();
      // The refetch has landed, so the completed set is already `done` — the
      // plain look-ahead is enough here.
      startRest(rest.seconds, upcomingExerciseName(), rest.exerciseId);
    });

    // The event can land while this screen is unmounted (a background launch),
    // so also reconcile whenever we come back to the foreground.
    const resumed = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshRef.current();
    });

    return () => {
      offRest();
      offChange();
      resumed.remove();
    };
  }, []);

  // Derived stats: volume + set count over done, non-warmup sets. A bodyweight
  // movement counts (bodyweight + added) × reps; with no bodyweight set it adds 0.
  // Summed in kilograms (typed weights are converted from the unit they are in,
  // so they can be added to the always-kg bodyweight) and shown in that unit.
  const { volume, doneSets } = useMemo(() => {
    let vol = 0;
    let count = 0;
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (!s.done) continue;
        const isWarmup = s.type === 'warmup';
        // Warmups add volume only when the setting is on; the SETS count always
        // stays working-only (matches the domain: setVolume vs countWorkingSets).
        if (isWarmup && !countWarmups) continue;
        const reps = parseFloat(s.reps) || 0;
        const added = inputToKg(s.weight, entryUnit) ?? 0;
        if (ex.kind === 'bodyweight') {
          const load = (bwKg ?? 0) + added;
          if (load > 0) vol += load * reps;
        } else {
          vol += added * reps;
        }
        if (!isWarmup) count += 1;
      }
    }
    return { volume: Math.round(volumeToDisplay(vol, entryUnit)), doneSets: count };
  }, [exercises, bwKg, countWarmups, entryUnit]);

  // Every planned set is logged. `locateNextSet` returns null when nothing is
  // left to log.
  const allSetsDone = useMemo(
    () =>
      !loading &&
      exercises.length > 0 &&
      exercises.some((e) => e.sets.length > 0) &&
      !locateNextSet(exercises),
    [loading, exercises],
  );

  // Prompt to finish once the last set lands (#45). A sheet rather than a card
  // further down the list: after logging the final set the list is scrolled to
  // wherever you were, so anything appended below is off-screen and the moment
  // passes unnoticed. Dismissible — adding another exercise is still valid — and
  // it re-arms only after there is something left to log again, so dismissing it
  // doesn't make it reappear on every re-render.
  const [donePromptOpen, setDonePromptOpen] = useState(false);
  const donePromptArmed = useRef(true);
  useEffect(() => {
    if (allSetsDone && donePromptArmed.current) {
      donePromptArmed.current = false;
      setDonePromptOpen(true);
    } else if (!allSetsDone) {
      donePromptArmed.current = true;
    }
  }, [allSetsDone]);

  // --- set mutations ---
  const patchSet = (exId: string, setId: string, patch: Partial<Exercise['sets'][number]>) =>
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exId
          ? ex
          : { ...ex, sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) },
      ),
    );

  useEffect(() => {
    installRestAlertHandler();
    let cancelled = false;
    (async () => {
      try {
        const s = await getSettings();
        setHapticsEnabled(s.haptic_feedback);
        if (cancelled || !s.rest_timer_alerts) return;
        setRestAlertsSetting(true);
        const granted = await ensureAlertPermission();
        setAlertsEnabled(granted);
        void maybeAskForExactAlarms(granted);
      } catch {
        // Unreachable server or a declined prompt: no alerts, no crash.
      }
    })();
    return () => {
      cancelled = true;
      void cancelRestAlert(restAlertId.current);
    };
  }, []);

  /** (Re)schedule the end-of-rest alert, replacing any pending one. */
  const armRestAlert = (seconds: number, exerciseName: string | null) => {
    const pending = restAlertId.current;
    restAlertId.current = null;
    void cancelRestAlert(pending);
    if (!shouldSchedule(alertsEnabled, seconds)) return;
    void scheduleRestAlert(seconds, exerciseName).then((id) => {
      restAlertId.current = id;
    });
  };

  /**
   * Name of the exercise the *next* set belongs to — what the end-of-rest alert
   * announces. `justCompleted` is skipped as though already done, so this can be
   * called before `setExercises` has re-rendered. `null` once nothing is left.
   */
  const upcomingExerciseName = (justCompleted?: string): string | null =>
    locateNextSet(exercisesRef.current, justCompleted)?.exercise.name ?? null;

  const startRest = (
    seconds: number,
    exerciseName: string | null = null,
    exerciseId: string | null = null,
  ) => {
    if (seconds <= 0) return;
    // A new rest is about a new set — or about none, when it was started by
    // hand, from the Lock Screen or from the Watch. `toggleDone` asks again
    // for the set it just ticked.
    setEffortPrompt(null);
    const now = Date.now();
    setRestTotal(seconds);
    setRestRemaining(seconds);
    setRestStartedAt(now);
    setRestEndsAt(now + seconds * 1000);
    setRestExId(exerciseId);
    restEndsRef.current = now + seconds * 1000;
    armRestAlert(seconds, exerciseName);
  };

  /**
   * Nudge the running rest by ±seconds. One place, because three surfaces do it
   * (the in-app ±15, the Lock Screen card's, the Watch's) and every one of them
   * also has to re-arm the scheduled alert — a countdown that moved with an
   * alert that didn't buzzes at the old moment.
   *
   * `restEndsRef` is written straight away so a drain of several queued card
   * taps in one tick composes instead of all reading the same pre-tick end.
   */
  const adjustRest = (deltaSeconds: number) => {
    const end = restEndsRef.current;
    if (end == null) return;
    const now = Date.now();
    const endsAt = Math.max(now, end + deltaSeconds * 1000);
    restEndsRef.current = endsAt;
    const remaining = restRemainingSeconds(endsAt, now);
    setRestEndsAt(endsAt);
    setRestRemaining(remaining);
    if (deltaSeconds > 0) setRestTotal((t) => Math.max(t, remaining));
    armRestAlert(remaining, upcomingExerciseName());
  };

  // Ending rest early (Skip, or trimming it to zero) must also cancel the
  // scheduled end-of-rest notification — otherwise it still fires later and
  // buzzes "Rest complete" for a rest the user already left. Natural completion
  // doesn't come through here (see the bounds-clearing effect above); its alert
  // is meant to fire.
  const endRest = () => {
    setRestRemaining(0);
    setRestStartedAt(null);
    setRestEndsAt(null);
    setRestExId(null);
    setEffortPrompt(null);
    restEndsRef.current = null;
    if (workoutId) clearRest(workoutId); // skipped — nothing to restore
    const pending = restAlertId.current;
    restAlertId.current = null;
    void cancelRestAlert(pending);
  };

  const toggleDone = (exId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!ex || !set) return;
    const willBeDone = !set.done;

    // Completing a set you never typed into logs the values shown as
    // placeholders — carried down from the nearest filled set above. The same
    // rule serves the Live Activity's ✓; see completionPatch.
    if (willBeDone) {
      const idx = ex.sets.findIndex((s) => s.id === setId);
      const { filled, patch } = completionPatch(ex.sets, idx);
      if (Object.keys(patch).length > 0) {
        patchSet(exId, setId, { weight: filled.weight, reps: filled.reps });
        // `completionPatch` works on the strings as typed, so its weight is in
        // the entry unit; storage takes kilograms.
        const stored =
          patch.weight === undefined
            ? patch
            : { ...patch, weight: inputToKg(filled.weight, entryUnit) };
        if (persist) write(patchSetApi(setId, stored));
      }
    }

    patchSet(exId, setId, { done: willBeDone });
    if (willBeDone) haptics.commit(); // a set logged — the accent moment
    // The rest belongs to the exercise just finished, but the alert announces
    // what is *coming* — which, after an exercise's last set, is the next
    // exercise. `exercises` has not re-rendered yet, so the set being completed
    // is passed as `treatAsDone`.
    if (willBeDone) {
      // Inside a superset the rest waits for the round to finish: completing the
      // first partner sends you to the second rather than starting a timer,
      // which is the entire point of pairing them. A solo exercise is unchanged.
      const decision = restAfterSet(
        exercises.map((e) => ({
          id: e.id,
          supersetGroup: e.supersetGroup ?? null,
          rest: e.rest,
          sets: e.sets.map((x) => ({ id: x.id, type: x.type, done: x.done })),
        })),
        exId,
        setId,
      );
      if (decision.startRest) {
        startRest(decision.seconds, upcomingExerciseName(setId), ex.id);
        // Ask about this set in the rest that just started. Not when no rest
        // did (timer off, mid-superset): the row's own slot is the way in then.
        if (shouldPromptEffort(effortMode, decision)) {
          setEffortPrompt({ exerciseId: exId, setId, saved: false });
        }
      } else {
        // No timer — but the active row must move to the partner, or the screen
        // would still be pointing at the exercise you just finished.
        endRest();
      }
    }
    // Unticked: there is no longer a set to ask about.
    if (!willBeDone) setEffortPrompt((p) => (p?.setId === setId ? null : p));
    if (persist) write(patchSetApi(setId, { done: willBeDone }));
  };

  /** Rate a set, or clear its rating with null. Always RPE, whatever is shown. */
  const rateSet = (exId: string, setId: string, rpe: number | null) => {
    patchSet(exId, setId, { rpe });
    if (persist) write(patchSetApi(setId, { rpe }));
  };

  const cycleType = (exId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!set) return;
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(set.type) + 1) % TYPE_CYCLE.length];
    patchSet(exId, setId, { type: next });
    haptics.select();
    if (persist) write(patchSetApi(setId, { type: next }));
  };

  const usePrev = (exId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!set) return;
    const weight = set.prevWeight ?? '';
    const reps = set.prevReps ?? '';
    patchSet(exId, setId, { weight, reps });
    if (persist) {
      const r = parseInt(reps, 10);
      write(
        patchSetApi(setId, {
          weight: inputToKg(weight, entryUnit),
          reps: Number.isNaN(r) ? null : r,
        }),
      );
    }
  };

  /**
   * `text` is what the field shows, in the entry unit. It is converted to
   * kilograms here, once, and the pending write keeps that number — so a unit
   * switched before the debounce fires cannot reinterpret it.
   *
   * Callers that already hold exact kilograms (the plate calculator) pass them
   * as `kg`, so the value stored is theirs and not a re-conversion of the text.
   */
  const editWeight = (
    exId: string,
    setId: string,
    text: string,
    kg: number | null = inputToKg(text, entryUnit),
  ) => {
    patchSet(exId, setId, { weight: text });
    if (persist) debounce(`w:${setId}`, () => patchSetApi(setId, { weight: kg }));
  };

  const editReps = (exId: string, setId: string, text: string) => {
    patchSet(exId, setId, { reps: text });
    if (persist) {
      const r = parseInt(text, 10);
      debounce(`r:${setId}`, () => patchSetApi(setId, { reps: Number.isNaN(r) ? null : r }));
    }
  };

  const addSet = (exId: string) => {
    const ex = exercisesRef.current.find((e) => e.id === exId);
    const last = ex?.sets[ex.sets.length - 1];
    const fresh = makeSet(last?.prevWeight, last?.prevReps);
    // Show the row on *this* tap. The previous version awaited the DB insert
    // before rendering, so every tap's row appeared only after the write landed;
    // behind a backlog of serialised SQLite writes (debounced weight/reps edits,
    // done-toggles) that lag was long enough that a tap looked like it did
    // nothing — so you tapped again, and several rows landed at once (#44).
    // Rendering first, under the set's own id, keeps the write ordered: the
    // insert is enqueued here, before any checkmark/edit on the new row could
    // enqueue its patch, so persist-first's "no patch before the row exists"
    // guarantee still holds (the DB runs writes in call order).
    setExercises((prev) =>
      prev.map((e) => (e.id === exId ? { ...e, sets: [...e.sets, fresh] } : e)),
    );
    if (persist && workoutId) {
      write(
        addSetApi(workoutId, exId, { id: fresh.id, type: 'normal', done: false }).catch(
          (err) => {
            // Insert failed — take the optimistic row back out so we never show a
            // set the store doesn't hold.
            setExercises((prev) =>
              prev.map((e) =>
                e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== fresh.id) } : e,
              ),
            );
            throw err;
          },
        ),
      );
    }
  };

  const setNote = (exId: string, note: string) => {
    setExercises((prev) => prev.map((ex) => (ex.id === exId ? { ...ex, note } : ex)));
    // Persist so the note survives a refetch (e.g. a foreground reload) — without
    // this it lived only in local state and vanished on the next rebuild.
    if (persist) write(setNoteApi(exId, note));
  };

  const removeExercise = (exId: string) => {
    setOpenMenuId(null);
    setExercises((prev) => prev.filter((ex) => ex.id !== exId));
    if (persist && workoutId) {
      // Was local-only: the exercise reappeared on reload.
      removeWorkoutExercise(workoutId, exId).catch(() => {
        // Nothing was removed (it is all or nothing), so the exercise still
        // counts at finish. Show what the store holds rather than hide it.
        void refresh();
      });
    }
  };

  /** Which exercise the library is picking a replacement for. */
  const replaceTarget = useRef<string | null>(null);

  const openReplace = (exId: string) => {
    setOpenMenuId(null);
    replaceTarget.current = exId;
    router.push('/exercise-library?pick=1');
  };

  /**
   * Swap an exercise, keeping its position. There is no single swap operation,
   * so it is add + remove + reorder: `addWorkoutExercise` appends, and
   * the reorder puts the newcomer back where the old one stood.
   *
   * Sets are not carried over — they are another exercise's numbers.
   */
  const applyReplace = useRef<(exId: string, chosen: ExerciseOut) => Promise<void>>(
    async () => {},
  );
  applyReplace.current = async (exId, chosen) => {
    const current = exercisesRef.current;
    const index = current.findIndex((e) => e.id === exId);
    if (index === -1) return;
    const old = current[index];

    const swapped = swapExercise(old, chosen, makeSet()) as Exercise;

    // Optimistic: the row keeps the old id until the refetch lands.
    setExercises((prev) => prev.map((e) => (e.id === exId ? swapped : e)));
    if (!persist || !workoutId) return;

    try {
      const created = await addWorkoutExercise(workoutId, {
        exercise_id: chosen.id,
        rest_seconds: old.rest,
      });
      await removeWorkoutExercise(workoutId, exId);
      // `add` appended; put the newcomer back in the old exercise's slot.
      await reorderExercises(
        workoutId,
        replaceOrder(current.map((e) => e.id), exId, created.id),
      );
    } catch {
      // Swallowed so the caller still refetches: whatever the store actually
      // holds wins over the optimistic swap above.
    }
  };

  /** Delete a set immediately — the swipe-open + Delete tap is already deliberate. */
  const deleteSet = (exId: string, setId: string) => {
    setOpenSetId(null);
    setExercises((prev) =>
      prev.map((e) => (e.id === exId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e)),
    );
    if (persist && workoutId) {
      deleteSetApi(setId).catch(() => {
        // The set is still stored, and would count at finish: bring it back.
        void refresh();
      });
    }
  };

  /** Commit a full reorder from the drag overlay; the store persists `position`. */
  const commitOrder = (next: Exercise[]) => {
    setExercises(next);
    if (persist && workoutId) {
      reorderExercises(workoutId, next.map((e) => e.id)).catch(() => {});
    }
  };

  /**
   * Tear down and leave a discarded workout. The discard is awaited before
   * navigating: Home refetches its active-workout bar on focus, and firing the
   * discard un-awaited let that refetch see the workout still active — so it came
   * back "minimized" and had to be discarded a second time. `discard: true` also
   * tells the Watch to drop its recording rather than write it to Health.
   */
  const discardAndLeave = async () => {
    void LiveActivity.end();
    stopWatchSession({ discard: true });
    forgetActiveWorkout();
    if (workoutId) clearRest(workoutId);
    try {
      if (persist && workoutId) await discardWorkout(workoutId);
    } catch {
      // Best-effort — leave regardless so the user isn't stuck on a dead workout.
    }
    // Pop back to where the workout was opened from rather than stacking a fresh
    // Home on top of the existing tabs.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Confirmation now lives in WorkoutHeader's bottom-sheet (reusing the app's
  // sheet pattern); this just performs the discard once the user confirms there.
  const onDiscard = () => {
    void discardAndLeave();
  };

  const setRest = (exId: string, seconds: number) => {
    setExercises((prev) => prev.map((ex) => (ex.id === exId ? { ...ex, rest: seconds } : ex)));
    // Persist so the finish-time routine diff can see a changed rest (#46) and so
    // it survives a reload; local-only before.
    if (persist) write(setRestApi(exId, seconds));

    // A rest already counting down for this exercise adopts the new duration
    // now, rather than only on the next set. Re-anchored on when the rest
    // started, so the part already served still counts: 30s into a 2:00 rest,
    // switching to 3:00 leaves 2:30 — not a fresh 3:00.
    if (restExId !== exId || restStartedAt == null) return;
    const now = Date.now();
    const endsAt = restStartedAt + seconds * 1000;
    // The new duration is already spent (or the picker's "Off") — the rest is
    // simply over, and endRest cancels the alert that was scheduled for it.
    if (endsAt <= now) {
      endRest();
      return;
    }
    const remaining = restRemainingSeconds(endsAt, now);
    setRestTotal(seconds);
    setRestEndsAt(endsAt);
    setRestRemaining(remaining);
    restEndsRef.current = endsAt;
    armRestAlert(remaining, upcomingExerciseName());
  };

  /**
   * One finish at a time: the header button, the "all sets done" prompt and the
   * Watch's end action can all ask for it. A ref, because state lags a tap by a
   * render. Released only when the finish fails; a finish that worked is on its
   * way off this screen.
   */
  const finishStarted = useRef(false);
  /**
   * The id of a Watch finish request that arrived while a finish was already
   * in flight, and so was turned away: that Watch is waiting for the outcome
   * of the finish under way, whoever started it.
   */
  const joinedWatchFinishId = useRef<string | null>(null);

  /**
   * `fromWatch`: the Watch asked. `watchFinishId` is its request's id when it
   * is still recording and waiting to hear how this goes (#95); null when it
   * ended its own session before asking, as older Watch builds always do.
   */
  const finish = async (fromWatch: boolean, watchFinishId: string | null = null) => {
    if (finishStarted.current) {
      if (watchFinishId) joinedWatchFinishId.current = watchFinishId;
      return;
    }
    finishStarted.current = true;
    // The same instant the teardown below used to run at, before the write.
    const finishBeganAt = Date.now();
    let summary: Awaited<ReturnType<typeof finishWorkout>> | null = null;
    if (persist && workoutId) {
      // The one step that stays ahead of the write: start listening for the
      // Watch's "saved" message. A Watch that ended the session itself sends it
      // while the write runs, and syncFinishedWorkout below would be too late
      // to hear it. Listening changes nothing if the finish then fails.
      if (watchRecordedRef.current) ensureWatchSaveListener();
      try {
        // Land any in-flight weight/reps edits before finishWorkout reads the DB to
        // compute volume/PRs — otherwise a value typed within the last 600ms is lost.
        await flushPending();
        summary = await finishWorkout(workoutId);
      } catch {
        // Nothing was stored and the workout is still running, so everything
        // that belongs to a running workout is left exactly as it was: the
        // Live Activity, the Watch session, the rest timer, the pointer that
        // reopens this screen. Finishing used to take those down first.
        finishStarted.current = false;
        haptics.error();
        // Tell a waiting Watch it failed, so it keeps recording and says so.
        // One that closed its session before asking (or gave up waiting) is
        // back on its Start screen: put it back in the workout, as opening
        // this screen does, with a new session if it records and the state to
        // show either way. Starting a session the Watch still has does nothing.
        // The same goes for a Watch that asked while this finish, started
        // here, was already being written.
        const watch = watchAwaitingFinish(fromWatch, watchFinishId, joinedWatchFinishId.current);
        joinedWatchFinishId.current = null;
        if (watch.involved) {
          void startWatchSession();
          const push = withFinishVerdict(watchStateRef.current, 'failed', watch.finishId);
          if (push) pushWatchState(push);
        }
        Alert.alert('Couldn’t finish workout', 'Nothing was changed. Try again.');
        return;
      }
    }
    // Read after the write: a Watch can have asked while it was running.
    const watchAwaitsOutcome =
      watchAwaitingFinish(fromWatch, watchFinishId, joinedWatchFinishId.current).finishId != null;
    joinedWatchFinishId.current = null;
    haptics.success(); // workout done
    // Not on unmount: leaving the screen with the workout still running is
    // exactly when the card is useful (see the home screen's resume bar).
    void LiveActivity.end();
    // Also what tells a Watch waiting on this finish that it worked: it ends
    // its session and saves on this, exactly as when Finish is tapped here.
    stopWatchSession();
    forgetActiveWorkout();
    if (workoutId) clearRest(workoutId);
    // Mirror the session to Apple Health (best-effort; never blocks finishing).
    // `startedAt` is the same stored origin the elapsed clock uses. When the Watch
    // was recording, this waits briefly for it to confirm its save and writes the
    // workout itself if it doesn't — so it survives navigating to the summary.
    if (startedAt != null) {
      void syncFinishedWorkout(
        workoutId,
        startedAt,
        finishBeganAt,
        watchRecordedRef.current,
        finishBeganAt,
        watchAwaitsOutcome,
      );
    }
    if (summary && workoutId) {
      saveSummary(workoutId, summary);
      // `justFinished=1` distinguishes a real finish from viewing a past
      // workout's summary, so the review nudge (#48) only fires on a finish.
      router.replace(`/summary/${workoutId}?justFinished=1`);
      return;
    }
    // Nothing is stored for this one (the offline demo): just leave.
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const onFinish = () => void finish(false);

  // --- Apple Watch companion: mirror state to the Watch, apply its controls ---
  const watchState = useMemo(
    () =>
      buildWatchState(
        exercises,
        name || 'Workout',
        {
          resting: restRemaining > 0,
          remaining: restRemaining,
          total: restTotal,
          // The Watch buzzes off this date on its own clock, so the wrist is
          // told the rest is up even while this screen's JS is suspended.
          endsAt: restEndsAt,
          alerts: restAlertsSetting,
        },
        (sets, i) => resolveSet(sets[i], carryFor(sets, i)),
        startedAt,
        bwKg ?? 0,
        countWarmups,
        entryUnit,
      ) ??
      // Every set logged: push a completed snapshot so the Watch can offer its
      // end-of-workout actions. Skipping the push here left the wrist showing a
      // stale mid-workout state (#45 on the watch side).
      buildFinishedWatchState(
        exercises,
        name || 'Workout',
        startedAt,
        bwKg ?? 0,
        countWarmups,
        entryUnit,
        restAlertsSetting,
      ),
    [
      exercises,
      name,
      restRemaining,
      restTotal,
      restEndsAt,
      restAlertsSetting,
      startedAt,
      bwKg,
      countWarmups,
      entryUnit,
    ],
  );
  const watchStateRef = useRef(watchState);
  watchStateRef.current = watchState;

  useEffect(() => {
    if (isDemo || !watchState) return;
    pushWatchState(watchState);
  }, [isDemo, watchState]);

  // Ref so the once-registered listener never closes over stale handlers/state.
  const applyWatchAction = useRef<(a: WatchAction) => void>(() => {});
  applyWatchAction.current = (a) => {
    const st = watchStateRef.current;
    switch (a.action) {
      case 'logSet': {
        if (!st) return;
        const ex = exercisesRef.current.find((e) => e.id === st.currentExerciseId);
        // The Watch sends the Crown-adjusted values, already carry-forward-filled
        // when they were pushed, so log them straight through and start rest.
        // Its weight is in the unit the Watch was showing, which it sends along
        // (older Watch builds don't; then it is the unit we last pushed). That
        // may not be ours any more, so re-express it for the field, and store
        // kilograms.
        const sentIn = a.unit === 'kg' || a.unit === 'lb' ? a.unit : st.unit;
        patchSet(st.currentExerciseId, st.currentSetId, {
          weight: convertWeightText(a.weight, sentIn, entryUnit),
          reps: a.reps,
          done: true,
        });
        if (persist) {
          write(
            patchSetApi(st.currentSetId, {
              weight: inputToKg(a.weight, sentIn),
              reps: a.reps === '' ? null : Number(a.reps),
              done: true,
            }),
          );
        }
        if (ex) startRest(ex.rest, upcomingExerciseName(st.currentSetId), ex.id);
        break;
      }
      case 'adjustRest':
        adjustRest(a.seconds);
        break;
      case 'skipRest':
        endRest();
        break;
      case 'end':
        void finish(true, finishRequestId(a));
        break;
      case 'discard':
        void discardAndLeave();
        break;
      case 'addSet':
        if (st) addSet(st.currentExerciseId);
        break;
      case 'requestState':
        // The Watch just entered its session and wants the current state — push it
        // so it fills in from defaults immediately.
        if (!isDemo && st) pushWatchState(st);
        break;
      default:
        break; // startEmpty / startRoutine only apply before a workout exists
    }
  };

  // Claim the Watch's Finish/Discard while this screen is mounted, so the root
  // layout's fallback stands down and only one of us completes the workout. The
  // screen is the better handler when it exists: it also ends the Live Activity,
  // mirrors to Health and navigates to the summary.
  useEffect(() => {
    if (!workoutId) return;
    return claimWatchFinish(workoutId);
  }, [workoutId]);

  useEffect(() => {
    const offAction = onWatchAction((a) => applyWatchAction.current(a));
    const offMetrics = onWatchMetrics(({ bpm, cal }) => {
      watchRecordedRef.current = true;
      if (bpm > 0) setHeartRate(bpm);
      if (cal > 0) setActiveCal(cal);
    });
    return () => {
      offAction();
      offMetrics();
    };
  }, []);

  // Read the gym's bar and plates for the unit the workout is typed in, and
  // re-read them whenever a sheet that uses them opens. They are edited on
  // another screen, and the workout outlives that trip, so loading once would
  // leave the calculator proposing plates the user has just said they don't
  // have. Each unit has its own rack, so a unit switch is a different setup —
  // and it has to be in hand before a sheet opens, because the warm-up ramp and
  // the progression suggestion read it too.
  const warmupSheetOpen = warmupExId != null;
  useEffect(() => {
    let alive = true;
    void getPlateSetup(entryUnit).then((s) => {
      if (alive) setPlateSetupState(s);
    });
    return () => {
      alive = false;
    };
  }, [entryUnit, plateSheetOpen, warmupSheetOpen]);

  // The exercise whose weight is being typed, when plates apply to it at all.
  const plateExercise = useMemo(() => {
    if (!focusedSet) return null;
    const ex = exercises.find((e) => e.id === focusedSet.exerciseId);
    return ex && ex.equipment === 'barbell' ? ex : null;
  }, [focusedSet, exercises]);

  // What the user has typed so far, or what the row would log if they ticked it
  // now — so opening Plates on an untouched set still has something to work from.
  // The plate sheet takes kilograms and solves in the rack's own unit, so the
  // typed text is converted on the way in (and `onUse` hands kilograms back).
  const plateTargetKg = useMemo(() => {
    if (!plateExercise || !focusedSet) return NaN;
    const sets = plateExercise.sets;
    const i = sets.findIndex((x) => x.id === focusedSet.setId);
    if (i === -1) return NaN;
    const resolved = resolveSet(sets[i], carryFor(sets, i));
    return inputToKg(resolved.weight, entryUnit) ?? NaN;
  }, [plateExercise, focusedSet, entryUnit]);

  /**
   * The first working set of an exercise, when it has a weight to ramp toward.
   * Warm-ups are only worth offering for weighted work that already knows where
   * it's going — a set with no weight yet has no ladder.
   */
  const warmupBaseFor = (ex: (typeof exercises)[number]) => {
    if (ex.kind === 'bodyweight') return null;
    if (ex.sets.some((x) => x.type === 'warmup')) return null;
    const i = ex.sets.findIndex((x) => x.type !== 'warmup');
    if (i === -1) return null;
    const resolved = resolveSet(ex.sets[i], carryFor(ex.sets, i));
    // The ramp is computed in kilograms; the working weight is typed in the
    // entry unit.
    const kgValue = inputToKg(resolved.weight, entryUnit);
    const repsValue = parseInt(String(resolved.reps), 10);
    if (kgValue === null || !Number.isFinite(kgValue) || kgValue <= 0) return null;
    return { kg: kgValue, reps: Number.isFinite(repsValue) ? repsValue : 0 };
  };

  const warmupExercise = exercises.find((e) => e.id === warmupExId) ?? null;
  const warmupBase = warmupExercise ? warmupBaseFor(warmupExercise) : null;

  const insertWarmups = (exId: string, rows: RampRow[]) => {
    // Rows arrive in kilograms. The field shows them in the entry unit; storage
    // gets the kilograms as given (`kg`), not a re-conversion of that text.
    const fresh = rows.map((r) => ({
      ...makeSet(),
      type: 'warmup' as const,
      weight: weightText(r.kg, entryUnit),
      reps: String(r.reps),
      kg: r.kg,
    }));
    setExercises((prev) =>
      prev.map((e) =>
        e.id === exId ? { ...e, sets: [...fresh.map(({ kg: _kg, ...s }) => s), ...e.sets] } : e,
      ),
    );
    if (persist && workoutId) {
      write(
        insertWarmupSets(
          exId,
          fresh.map((f) => ({ id: f.id, weight: f.kg, reps: Number(f.reps) })),
        ).catch(() => {
          // Insert failed — take the optimistic rows back out rather than show
          // sets the store doesn't hold.
          setExercises((prev) =>
            prev.map((e) =>
              e.id === exId
                ? { ...e, sets: e.sets.filter((x) => !fresh.some((f) => f.id === x.id)) }
                : e,
            ),
          );
        }),
      );
    }
    setWarmupExId(null);
  };

  useEffect(() => {
    let alive = true;
    void listExerciseUsage()
      .then((u) => {
        if (!alive) return;
        setLastTrained(new Map([...u].map(([id, v]) => [id, v.lastAt])));
      })
      .catch(() => {});
    void getDeloadState().then((d) => {
      if (alive) setDeload(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * The proposal for a set, or null when there is nothing worth saying.
   *
   * Computed at render and never stored: ✓ logs what is in the inputs, so the
   * suggestion can never become a value the user didn't choose.
   *
   * NOTE (decision #4, routine targets): schema has no rep-range field, and the
   * screen doesn't load the routine, so "reached the target" falls back to the
   * spec's documented alternative — matching what you did last time.
   */
  const suggestionFor = (exId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((x) => x.id === setId);
    if (!ex || !set) return null;
    const catalogId = ex.exerciseCatalogId;
    return suggestNextSet({
      equipment: ex.equipment,
      kind: ex.kind,
      setType: set.type,
      // `prevWeight` is in the entry unit, and so is the suggestion that comes
      // back — the steps below are therefore that unit's own, not conversions.
      last:
        set.prevWeight != null || set.prevReps != null
          ? { weight: Number(set.prevWeight ?? 0), reps: Number(set.prevReps ?? 0) }
          : null,
      lastSessionAt: catalogId ? (lastTrained.get(catalogId) ?? null) : null,
      targetReps: null,
      // On a bar the smallest jump is whatever this gym's smallest pair makes,
      // in the unit the rack is in. That only applies while the rack on hand
      // is in the unit being typed; until it is, the unit's own bar step.
      step:
        ex.equipment === 'barbell' && setupUnit(plateSetup) === entryUnit
          ? smallestStepKg(plateSetup)
          : WEIGHT_STEPS[entryUnit].bar,
      dumbbellStep: WEIGHT_STEPS[entryUnit].dumbbell,
      now: Date.now(),
      // The only route to a downward suggestion: a deload the user accepted on
      // a previous summary. Nothing here decides to back off on its own.
      deloadActive: !!(deload && catalogId && deloadActiveFor(deload, catalogId)),
    });
  };

  /** Groups `exId` with the chosen partners, or dissolves its group. */
  const applySuperset = async (exId: string, partnerIds: string[]) => {
    if (!workoutId) return;
    const ids = [exId, ...partnerIds];
    try {
      const group = await nextSupersetGroup(workoutId);
      await setSupersetGroup(ids, group);
      setExercises((prev) =>
        prev.map((e) => (ids.includes(e.id) ? { ...e, supersetGroup: group } : e)),
      );
    } catch {
      // Grouping failed; the list is unchanged, so nothing is half-applied.
    }
    setSupersetExId(null);
  };

  const leaveSuperset = async (exId: string) => {
    const me = exercises.find((e) => e.id === exId);
    if (!me || me.supersetGroup == null) return;
    const remaining = exercises.filter(
      (e) => e.supersetGroup === me.supersetGroup && e.id !== exId,
    );
    // A group of one is not a superset, so it dissolves with the leaver rather
    // than lingering as a rail drawn around a single card.
    const toClear = remaining.length <= 1 ? [exId, ...remaining.map((e) => e.id)] : [exId];
    try {
      await setSupersetGroup(toClear, null);
      setExercises((prev) =>
        prev.map((e) => (toClear.includes(e.id) ? { ...e, supersetGroup: null } : e)),
      );
    } catch {
      // as above
    }
    setOpenMenuId(null);
  };

  // --- supersets (#53) -------------------------------------------------
  const ssLabels = useMemo(
    () =>
      groupLabels(
        exercises.map((e) => ({
          id: e.id,
          supersetGroup: e.supersetGroup ?? null,
          rest: e.rest,
          sets: [],
        })),
      ),
    [exercises],
  );

  /** "A1" / "A2" — letter of the group, index within it. */
  const supersetTagFor = (exId: string): string | null => {
    const me = exercises.find((e) => e.id === exId);
    if (!me || me.supersetGroup == null) return null;
    const letter = ssLabels.get(me.supersetGroup);
    if (!letter) return null;
    const partners = exercises.filter((e) => e.supersetGroup === me.supersetGroup);
    return `${letter}${partners.findIndex((e) => e.id === exId) + 1}`;
  };

  /**
   * Earlier partners don't own the round's rest, so their row says where it
   * actually lives rather than a duration that will never run. Their stored
   * value is untouched, for when the group is broken up again.
   */
  const restLabelFor = (exId: string): string | null => {
    const me = exercises.find((e) => e.id === exId);
    if (!me || me.supersetGroup == null) return null;
    const partners = exercises.filter((e) => e.supersetGroup === me.supersetGroup);
    if (partners.length < 2) return null;
    const i = partners.findIndex((e) => e.id === exId);
    if (i === partners.length - 1) return null;
    const letter = ssLabels.get(me.supersetGroup);
    return `None · then ${letter}${i + 2}`;
  };

  /** Round label for the group header, from the first partner's progress. */
  const supersetHeaderFor = (exId: string): string | null => {
    const me = exercises.find((e) => e.id === exId);
    if (!me || me.supersetGroup == null) return null;
    const partners = exercises.filter((e) => e.supersetGroup === me.supersetGroup);
    if (partners.length < 2 || partners[0].id !== exId) return null; // header once per group
    const letter = ssLabels.get(me.supersetGroup);
    const rounds = Math.max(
      ...partners.map((p) => p.sets.filter((x) => x.type === 'normal').length),
    );
    const lead = partners[0];
    const doneRounds = lead.sets.filter((x) => x.type === 'normal' && x.done).length;
    const current = Math.min(rounds, doneRounds + 1);
    return `SUPERSET ${letter} · ROUND ${current} OF ${rounds}`;
  };

  // --- effort per set (#84) -------------------------------------------
  // Everything here is null with the setting Off, and the components below
  // take null to mean "render as you always did".
  const effortKind = effortMode === 'off' ? null : effortMode;

  /** The set a prompt or sheet points at, while it still exists. */
  const findSet = (ref: { exerciseId: string; setId: string } | null) => {
    if (!ref) return null;
    const ex = exercises.find((e) => e.id === ref.exerciseId);
    const index = ex ? ex.sets.findIndex((x) => x.id === ref.setId) : -1;
    return ex && index !== -1 ? { ex, index, set: ex.sets[index] } : null;
  };

  const promptTarget = effortKind ? findSet(effortPrompt) : null;
  const restBarEffort =
    effortKind && effortPrompt && promptTarget
      ? {
          kind: effortKind,
          badge: setBadge(promptTarget.ex.sets, promptTarget.index),
          rpe: promptTarget.set.rpe ?? null,
          saved: effortPrompt.saved,
          onRate: (rpe: number) => {
            rateSet(effortPrompt.exerciseId, effortPrompt.setId, rpe);
            setEffortPrompt((p) => (p ? { ...p, saved: true } : p));
          },
        }
      : null;

  const sheetTarget = effortKind ? findSet(effortSheet) : null;
  // What the row logged, carried values included, so the sheet can name it.
  const sheetValues = sheetTarget
    ? resolveSet(sheetTarget.set, carryFor(sheetTarget.ex.sets, sheetTarget.index))
    : null;
  // Kept after the sheet closes so it can slide away still showing its set,
  // rather than vanishing the instant a value is tapped.
  const effortSheetView = useRef<{
    kind: 'rpe' | 'rir';
    exerciseName: string;
    badge: string;
    weight: string;
    reps: string;
    bodyweight: boolean;
    rpe: number | null;
  } | null>(null);
  if (effortKind && sheetTarget && sheetValues) {
    effortSheetView.current = {
      kind: effortKind,
      exerciseName: sheetTarget.ex.name,
      badge: setBadge(sheetTarget.ex.sets, sheetTarget.index),
      // Already in the entry unit: these are the row's own strings.
      weight: sheetValues.weight,
      reps: sheetValues.reps,
      bodyweight: sheetTarget.ex.kind === 'bodyweight',
      rpe: sheetTarget.set.rpe ?? null,
    };
  }

  // The keypad bar's key: only while reps are being typed, where a rating is
  // the natural next thought. Named for the scale in use.
  const effortKeySet = effortKind && focusedSet?.field === 'reps' ? focusedSet : null;
  // Its scale, once the key is tapped. Tied to the set it was opened for, so
  // moving to another field or another set puts the normal bar back.
  const keypadTarget =
    effortKind && effortKeySet && keypadEffortSetId === effortKeySet.setId
      ? findSet(effortKeySet)
      : null;
  const keypadEffort =
    effortKind && effortKeySet && keypadTarget
      ? {
          kind: effortKind,
          badge: setBadge(keypadTarget.ex.sets, keypadTarget.index),
          rpe: keypadTarget.set.rpe ?? null,
          saved: false,
          /** One tap saves (or clears) and the normal bar is back. */
          rate: (rpe: number | null) => {
            rateSet(effortKeySet.exerciseId, effortKeySet.setId, rpe);
            setKeypadEffortSetId(null);
          },
        }
      : null;

  // The list ends with room for the rest bar. The effort section makes the
  // card taller, by a height that depends on whether it is open or folded, so
  // that much is added while it shows. Zero otherwise, and always with the
  // setting Off.
  const restEffortClearance = restRemaining > 0 && restBarEffort ? restEffortHeight : 0;

  const statusText = status === 'active' ? 'In progress' : status;
  const restSheetExercise = exercises.find((e) => e.id === restSheetExId) ?? null;

  return (
    <View style={styles.root}>
      <WorkoutHeader
        topInset={insets.top}
        name={name || 'Workout'}
        status={`${statusText} · ${fmtClock(elapsed)}`}
        time={fmtClock(elapsed)}
        volume={String(volume)}
        unit={entryUnit}
        sets={String(doneSets)}
        onBack={() => {
          forgetActiveWorkout();
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        }}
        onFinish={onFinish}
        onDiscard={onDiscard}
        heartRate={heartRate}
        activeCal={activeCal}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* "No exercises" is a claim about the workout, not about the network.
              Never make it while the first load is still in flight. */}
          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator color={color.accent} />
            </View>
          )}

          {!loading && exercises.length === 0 && <EmptyWorkout />}

          {exercises.map((ex) => (
            <View
              key={ex.id}
              style={ex.supersetGroup != null ? styles.ssMember : undefined}
            >
              {/* One header per group, then a rail down the screen margin tying
                  the partners together. No new colour: a 2pt text3 line. */}
              {supersetHeaderFor(ex.id) ? (
                <Text style={styles.ssHeader}>{supersetHeaderFor(ex.id)}</Text>
              ) : null}
              {ex.supersetGroup != null ? <View style={styles.ssRail} /> : null}
            <ExerciseCard
              exercise={ex}
              unit={entryUnit}
              onDeleteSet={(setId) => deleteSet(ex.id, setId)}
              openSetId={openSetId}
              onSetOpenChange={(setId, open) => setOpenSetId(open ? setId : null)}
              onReorderStart={() => {
                setOpenMenuId(null);
                setReordering(true);
              }}
              menuOpen={openMenuId === ex.id}
              onToggleMenu={() => setOpenMenuId((id) => (id === ex.id ? null : ex.id))}
              onReplace={() => openReplace(ex.id)}
              onSuperset={
                exercises.length < 2
                  ? undefined
                  : () => {
                      setOpenMenuId(null);
                      if (ex.supersetGroup != null) void leaveSuperset(ex.id);
                      else setSupersetExId(ex.id);
                    }
              }
              inSuperset={ex.supersetGroup != null}
              onRemove={() => removeExercise(ex.id)}
              onNoteChange={(t) => setNote(ex.id, t)}
              onOpenRest={() => {
                setOpenMenuId(null);
                setRestSheetExId(ex.id);
              }}
              onAddSet={() => addSet(ex.id)}
              onCycleType={(setId) => cycleType(ex.id, setId)}
              onUsePrev={(setId) => usePrev(ex.id, setId)}
              onWeightChange={(setId, t) => editWeight(ex.id, setId, t)}
              onRepsChange={(setId, t) => editReps(ex.id, setId, t)}
              onToggleDone={(setId) => toggleDone(ex.id, setId)}
              onFieldFocus={(setId, field) => {
                setFocusedSet({ exerciseId: ex.id, setId, field });
                setKeypadEffortSetId(null); // a newly focused field gets the normal bar
              }}
              effort={
                effortKind
                  ? {
                      kind: effortKind,
                      onOpen: (setId) => setEffortSheet({ exerciseId: ex.id, setId }),
                    }
                  : undefined
              }
              onWarmup={warmupBaseFor(ex) ? () => setWarmupExId(ex.id) : undefined}
              suggestionFor={(setId) => suggestionFor(ex.id, setId)}
              onUseSuggestion={(setId) => {
                const sug = suggestionFor(ex.id, setId);
                if (!sug) return;
                editWeight(ex.id, setId, String(sug.weight));
                editReps(ex.id, setId, String(sug.reps));
              }}
              onOpenDetail={
                ex.exerciseCatalogId
                  ? () => router.push(`/exercise/${ex.exerciseCatalogId}`)
                  : undefined
              }
              supersetTag={supersetTagFor(ex.id)}
              restOverrideLabel={restLabelFor(ex.id)}
            />
            </View>
          ))}

          <PressableScale
            style={styles.addExercise}
            onPress={() => {
              const id = workoutId ?? routeId;
              router.push(
                id ? `/exercise-library?workoutId=${id}` : '/exercise-library',
              );
            }}
          >
            <Text style={styles.addExercisePlus}>+</Text>
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </PressableScale>

          <View
            style={
              restEffortClearance > 0
                ? [styles.spacer, { height: SPACER_HEIGHT + restEffortClearance }]
                : styles.spacer
            }
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Done bar floated just above the keyboard — the numeric keypads have no
          return key, so this is their only dismiss affordance. Positioned by the
          live keyboard height because InputAccessoryView does not render under the
          New Architecture. iOS-only; shown only while the keyboard is up. */}
      {Platform.OS === 'ios' && kbHeight > 0 && keypadEffort ? (
        // The RPE key was tapped: the bar becomes the rest bar's question, in
        // the tree rather than in a sheet, so the keypad stays open and the
        // reps field keeps focus. Nothing in here can take focus.
        <View style={[styles.kbdEffort, { bottom: kbHeight }]}>
          <EffortSection effort={{ ...keypadEffort, onRate: keypadEffort.rate }} />
          <View style={styles.kbdEffortKeys}>
            <Pressable
              onPress={() => setKeypadEffortSetId(null)}
              style={styles.kbdEffortKey}
              accessibilityRole="button"
              accessibilityLabel="Back to the keypad bar"
            >
              <Text style={styles.kbdAccessoryAction}>Back</Text>
            </Pressable>
            {/* Nothing to clear on an unrated set, so the key isn't there. */}
            {keypadEffort.rpe != null ? (
              <Pressable
                onPress={() => keypadEffort.rate(null)}
                style={styles.kbdEffortKey}
                accessibilityRole="button"
                accessibilityLabel="Clear rating"
              >
                <Text style={styles.kbdAccessoryAction}>Clear rating</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : Platform.OS === 'ios' && kbHeight > 0 ? (
        <View style={[styles.kbdAccessory, { bottom: kbHeight }]}>
          {/* Plates only for barbell work. Dumbbells, machines and cables come in
              whatever increments they come in, so there is nothing to calculate —
              and a disabled button on every other exercise is worse than none. */}
          {effortKeySet ? (
            // With effort ratings on and reps being typed, the left side holds
            // two keys. Otherwise this branch is skipped and the bar is the
            // one below, untouched.
            <View style={styles.kbdAccessoryKeys}>
              {plateExercise ? (
                <Pressable
                  onPress={() => setPlateSheetOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Plate calculator"
                >
                  <Text style={styles.kbdAccessoryAction}>Plates</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setKeypadEffortSetId(effortKeySet.setId)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Rate this set"
              >
                <Text style={styles.kbdAccessoryAction}>{effortKind === 'rir' ? 'RIR' : 'RPE'}</Text>
              </Pressable>
            </View>
          ) : plateExercise ? (
            <Pressable
              onPress={() => setPlateSheetOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Plate calculator"
            >
              <Text style={styles.kbdAccessoryAction}>Plates</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            onPress={() => Keyboard.dismiss()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Hide keyboard"
          >
            <Text style={styles.kbdAccessoryDone}>Done</Text>
          </Pressable>
        </View>
      ) : null}

      <RestBar
        resting={restRemaining > 0}
        remaining={restRemaining}
        total={restTotal}
        onStart={() => startRest(DEFAULT_REST)}
        onMinus15={() => adjustRest(-15)}
        onPlus15={() => adjustRest(15)}
        onSkip={endRest}
        effort={restBarEffort}
        onEffortHeight={setRestEffortHeight}
      />

      {/* Never mounted until a sheet has been opened, which cannot happen with
          the setting Off. */}
      {effortSheetView.current ? (
        <EffortSheet
          visible={!!(effortKind && sheetTarget)}
          {...effortSheetView.current}
          unit={entryUnit}
          onRate={(rpe) => {
            if (effortSheet) rateSet(effortSheet.exerciseId, effortSheet.setId, rpe);
            // Leave showing what was picked. A cleared rating keeps its last
            // look, so the sheet does not reflow on its way out.
            if (rpe != null && effortSheetView.current) effortSheetView.current.rpe = rpe;
            setEffortSheet(null);
          }}
          onClose={() => setEffortSheet(null)}
        />
      ) : null}

      {warmupExercise && warmupBase && (
        <WarmupSheet
          visible
          exerciseName={warmupExercise.name}
          workingKg={warmupBase.kg}
          workingReps={warmupBase.reps}
          unit={entryUnit}
          equipment={warmupExercise.equipment}
          setup={plateSetup}
          onInsert={(rows) => insertWarmups(warmupExercise.id, rows)}
          onClose={() => setWarmupExId(null)}
        />
      )}

      <SupersetSheet
        visible={supersetExId != null}
        anchorExercise={exercises.find((e) => e.id === supersetExId) ?? null}
        candidates={exercises.filter((e) => e.id !== supersetExId)}
        onConfirm={(ids) => {
          if (supersetExId) void applySuperset(supersetExId, ids);
        }}
        onClose={() => setSupersetExId(null)}
      />

      <PlateSheet
        visible={plateSheetOpen}
        targetKg={plateTargetKg}
        setup={plateSetup}
        onUse={(kgValue) => {
          // Kilograms from the calculator: shown in the entry unit, stored as given.
          if (focusedSet) {
            editWeight(
              focusedSet.exerciseId,
              focusedSet.setId,
              weightText(kgValue, entryUnit),
              kgValue,
            );
          }
          setPlateSheetOpen(false);
        }}
        onEditSetup={() => {
          setPlateSheetOpen(false);
          router.push('/plates');
        }}
        onClose={() => setPlateSheetOpen(false)}
      />

      <RestPickerSheet
        visible={restSheetExId != null}
        selectedSeconds={restSheetExercise?.rest ?? -1}
        onSelect={(seconds) => {
          if (restSheetExId) setRest(restSheetExId, seconds);
          setRestSheetExId(null);
        }}
        onClose={() => setRestSheetExId(null)}
      />

      <DraggableSheet
        visible={donePromptOpen}
        onClose={() => setDonePromptOpen(false)}
        sheetStyle={[styles.doneSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View style={styles.doneGrabberWrap}>
          <View style={styles.doneGrabber} />
        </View>
        <View style={styles.doneBody}>
          <View style={styles.doneCheck}>
            <CheckIcon size={20} color={color.success} strokeWidth={3} />
          </View>
          <Text style={styles.doneTitle}>All sets done</Text>
          <Text style={styles.doneStat}>
            {`${doneSets} ${doneSets === 1 ? 'set' : 'sets'} · ${volume} ${entryUnit} · ${fmtClock(elapsed)}`}
          </Text>
          <PressableScale
            style={styles.doneFinish}
            onPress={() => {
              setDonePromptOpen(false);
              onFinish();
            }}
          >
            <Text style={styles.doneFinishText}>Finish Workout</Text>
          </PressableScale>
          <Pressable
            onPress={() => {
              setDonePromptOpen(false);
              const id = workoutId ?? routeId;
              router.push(id ? `/exercise-library?workoutId=${id}` : '/exercise-library');
            }}
            style={({ pressed }) => [styles.doneAdd, pressed && styles.doneAddPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.doneAddText}>Add another exercise</Text>
          </Pressable>
        </View>
      </DraggableSheet>

      <ReorderExercises
        visible={reordering}
        exercises={exercises}
        topInset={insets.top}
        onDone={() => setReordering(false)}
        onReorder={commitOrder}
      />
    </View>
  );
}

/** Room under the list for the rest bar's plain card. */
const SPACER_HEIGHT = 90;

const styles = StyleSheet.create({
  loading: { paddingVertical: 48, alignItems: 'center' },
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  scrollContent: {
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 12,
  },
  addExercise: {
    marginTop: 6,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
  },
  addExercisePlus: { fontFamily: font.titleSemi, fontSize: 20, lineHeight: 20, color: color.accent },
  addExerciseText: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },

  // End-of-workout prompt (#45)
  doneSheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  doneGrabberWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  doneGrabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
  doneBody: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  doneCheck: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(45,216,129,0.15)',
  },
  doneTitle: {
    marginTop: 12,
    fontFamily: font.titleSemi,
    fontSize: 18,
    letterSpacing: -0.18,
    color: color.text1,
  },
  doneStat: {
    marginTop: 5,
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  doneFinish: {
    marginTop: 18,
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accent,
  },
  doneFinishText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
  doneAdd: {
    marginTop: 10,
    width: '100%',
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
  },
  doneAddPressed: { borderColor: color.text3 },
  doneAddText: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text1 },
  spacer: { height: SPACER_HEIGHT },
  kbdAccessory: {
    position: 'absolute',
    left: 0,
    right: 0,
    // `bottom` is set inline to the live keyboard height so the bar floats just
    // above the keyboard.
    height: 44,
    flexDirection: 'row',
    // Plates sits left, Done right. With no Plates an empty View holds the slot
    // so Done stays where the thumb already expects it.
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.surface2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  kbdAccessoryKeys: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // The bar while it is rating a set: the rest card's effort section (board
  // 14a, F2) on the card's own surface, over a row of keys the bar's height.
  kbdEffort: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: color.surface3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  kbdEffortKeys: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  kbdEffortKey: { height: 44, justifyContent: 'center' },
  // Partners sit 4pt apart and share a rail in the screen margin.
  ssMember: { position: 'relative', marginBottom: 4 },
  ssHeader: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.text3,
    paddingTop: 10,
    paddingBottom: 6,
    paddingLeft: 7,
  },
  ssRail: {
    position: 'absolute',
    left: 7,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: color.text3,
  },
  kbdAccessoryAction: {
    fontFamily: font.bodyMedium,
    fontSize: 16,
    color: color.text1,
    paddingHorizontal: 6,
  },
  kbdAccessoryDone: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    color: color.accent,
    paddingHorizontal: 6,
  },
});
