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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as LiveActivity from '../../modules/live-activity';
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
  getPrevious,
  getPreviousNote,
  setWorkoutExerciseNote as setNoteApi,
  getWorkout,
  patchSet as patchSetApi,
  removeWorkoutExercise,
  reorderExercises,
} from '../../src/api/workouts';
import { takePendingSelection } from '../../src/lib/pendingSelection';
import { replaceOrder, swapExercise } from '../../src/lib/replaceExercise';
import { elapsedSeconds, restRemainingSeconds } from '../../src/lib/clocks';
import { parseServerDate } from '../../src/lib/serverTime';
import {
  forgetActiveWorkout,
  rememberActiveWorkout,
  rememberRest,
  recallRest,
  forgetRest,
} from '../../src/lib/activeWorkout';
import { onRestAction, onWorkoutChanged, type RestAction } from '../../src/lib/liveActivityBridge';
import type { ExerciseOut } from '../../src/api/types';
import { saveSummary } from '../../src/lib/summaryCache';
import {
  onWatchAction,
  onWatchMetrics,
  pushWatchState,
  startWatchSession,
  stopWatchSession,
  subscribeLiveHeartRate,
  syncFinishedWorkout,
} from '../../src/lib/healthSync';
import { buildWatchState } from '../../src/lib/watchState';
import type { WatchAction } from '../../modules/health';
import { color, font } from '../../src/theme/tokens';
import { EmptyWorkout } from '../../src/components/workout/EmptyWorkout';
import { ExerciseCard } from '../../src/components/workout/ExerciseCard';
import { ReorderExercises } from '../../src/components/workout/ReorderExercises';
import { RestBar } from '../../src/components/workout/RestBar';
import { RestPickerSheet } from '../../src/components/workout/RestPickerSheet';
import { carryFor, completionPatch, resolveSet } from '../../src/components/workout/setCarry';
import {
  cancelRestAlert,
  ensureAlertPermission,
  installRestAlertHandler,
  scheduleRestAlert,
  shouldSchedule,
} from '../../src/lib/restAlert';
import { WorkoutHeader } from '../../src/components/workout/WorkoutHeader';
import {
  fmtClock,
  makeSet,
  seedWorkout,
  TYPE_CYCLE,
  type Exercise,
} from '../../src/components/workout/types';

const START_ELAPSED = 12 * 60 + 47; // seeded "12:47"
const DEFAULT_REST = 120;

/** Server number → input string ('' for null). */
const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));

/** Map a stored WorkoutExerciseOut (+ optional previous-session sets) to the local model. */
function mapExercise(
  we: WorkoutExerciseOut,
  prev: PreviousSetOut[],
  prevNote: string | null = null,
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
    note: we.note ?? '',
    notePlaceholder: prevNote ?? undefined,
    sets: we.sets.map((s) => {
      const p = prevByPos.get(s.position);
      return {
        id: s.id,
        type: s.type,
        weight: numStr(s.weight),
        reps: numStr(s.reps),
        prevWeight: p?.weight == null ? undefined : String(p.weight),
        prevReps: p?.reps == null ? undefined : String(p.reps),
        done: s.done,
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
  const [workoutId, setWorkoutId] = useState<string | null>(isDemo ? null : routeId);
  const [persist, setPersist] = useState(!isDemo);
  const [name, setName] = useState(isDemo ? 'Temp Upper' : '');
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
  // Absolute bounds of the current rest, mirroring `restRemaining` for the Live
  // Activity: the widget ticks itself from these while the app is suspended, so
  // they change only when rest starts, is adjusted, or ends — never on the tick.
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [restSheetExId, setRestSheetExId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  // The rest alert is a scheduled notification, not an in-app sound: the JS timer
  // stops the moment iOS suspends the app, which is most of a real rest period.
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const restAlertId = useRef<string | null>(null);
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  // Live heart rate from a recording Apple Watch, via HealthKit. Null until a
  // real sample arrives, so the header chip stays hidden with no Watch — never
  // an invented number. `subscribeLiveHeartRate` self-gates on the connect +
  // read-HR preferences and is silent otherwise.
  const [heartRate, setHeartRate] = useState<number | null>(null);
  // True once the Watch streams metrics — it then owns the saved HKWorkout, so
  // the phone must not write a duplicate on finish.
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
        setPersist(false); // load failed → offline, don't write back
        setName('Temp Upper');
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
      setExercises(w.exercises.map((we, i) => mapExercise(we, prev[i], prevNotes[i])));
      // Restore an in-flight rest countdown if the app was killed mid-rest.
      const savedRest = recallRest(w.id);
      if (savedRest) {
        setRestTotal(savedRest.total);
        setRestEndsAt(savedRest.endsAt);
        setRestStartedAt(savedRest.endsAt - savedRest.total * 1000);
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
      const w = await getWorkout(routeId);
      const [prev, prevNotes] = await Promise.all([
        Promise.all(w.exercises.map((we) => getPrevious(w.id, we.id).catch(() => [] as PreviousSetOut[]))),
        Promise.all(w.exercises.map((we) => getPreviousNote(we.id).catch(() => null))),
      ]);
      setName(w.name);
      setStatus(w.status);
      setStartedAt(parseServerDate(w.started_at));
      setExercises(w.exercises.map((we, i) => mapExercise(we, prev[i], prevNotes[i])));
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

  // Fire-and-forget network write; failures are swallowed so local state never blocks.
  const write = (p: Promise<unknown>) => {
    p.catch(() => {});
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
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
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
    }
  }, [restRemaining, restEndsAt]);

  // Persist the in-flight rest so a mid-rest app *kill* (not just background)
  // can restore the countdown on reopen — it lives only in component state.
  useEffect(() => {
    if (!persist || !workoutId) return;
    if (restEndsAt != null) rememberRest(workoutId, restEndsAt, restTotal);
    else forgetRest();
  }, [persist, workoutId, restEndsAt, restTotal]);

  // The Lock Screen card. Memoised on the state it actually shows, so the 1 Hz
  // tick cannot push an ActivityKit update every second — the widget's own
  // `timerInterval:` handles the countdown between our updates.
  const resting = restRemaining > 0;
  const liveActivity = useMemo(
    () =>
      buildLiveActivityState(exercises, resting, (sets, i) =>
        resolveSet(sets[i], carryFor(sets, i)),
      ),
    [exercises, resting],
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
    setRestRemaining((r) => Math.max(0, r + action.seconds));
    setRestEndsAt((e) => (e == null ? e : Math.max(Date.now(), e + action.seconds * 1000)));
    if (action.seconds > 0) setRestTotal((t) => Math.max(t, restRemaining + action.seconds));
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
    const offChange = onWorkoutChanged(async (restSeconds) => {
      await refreshRef.current();
      const ex = exercisesRef.current.find((e) => e.sets.some((s) => !s.done));
      startRest(restSeconds, ex?.name ?? null);
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

  // Derived stats: volume + set count over done, non-warmup sets.
  const { volume, doneSets } = useMemo(() => {
    let vol = 0;
    let count = 0;
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (!s.done || s.type === 'warmup') continue;
        vol += (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0);
        count += 1;
      }
    }
    return { volume: Math.round(vol), doneSets: count };
  }, [exercises]);

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
        if (cancelled || !s.rest_timer_alerts) return;
        setAlertsEnabled(await ensureAlertPermission());
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

  const startRest = (seconds: number, exerciseName: string | null = null) => {
    if (seconds <= 0) return;
    const now = Date.now();
    setRestTotal(seconds);
    setRestRemaining(seconds);
    setRestStartedAt(now);
    setRestEndsAt(now + seconds * 1000);
    armRestAlert(seconds, exerciseName);
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
        if (persist) write(patchSetApi(setId, patch));
      }
    }

    patchSet(exId, setId, { done: willBeDone });
    if (willBeDone) startRest(ex.rest, ex.name);
    if (persist) write(patchSetApi(setId, { done: willBeDone }));
  };

  const cycleType = (exId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (!set) return;
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(set.type) + 1) % TYPE_CYCLE.length];
    patchSet(exId, setId, { type: next });
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
      const w = parseFloat(weight);
      const r = parseInt(reps, 10);
      write(
        patchSetApi(setId, {
          weight: Number.isNaN(w) ? null : w,
          reps: Number.isNaN(r) ? null : r,
        }),
      );
    }
  };

  const editWeight = (exId: string, setId: string, text: string) => {
    patchSet(exId, setId, { weight: text });
    if (persist) {
      const w = parseFloat(text);
      debounce(`w:${setId}`, () => patchSetApi(setId, { weight: Number.isNaN(w) ? null : w }));
    }
  };

  const editReps = (exId: string, setId: string, text: string) => {
    patchSet(exId, setId, { reps: text });
    if (persist) {
      const r = parseInt(text, 10);
      debounce(`r:${setId}`, () => patchSetApi(setId, { reps: Number.isNaN(r) ? null : r }));
    }
  };

  const addSet = async (exId: string) => {
    const ex = exercises.find((e) => e.id === exId);
    const last = ex?.sets[ex.sets.length - 1];
    const fresh = makeSet(last?.prevWeight, last?.prevReps);
    // Persist FIRST under the set's own id, then show it — so a fast tap on its
    // checkmark can never hit a not-yet-inserted row (the old temp-id swap could
    // lose that write). No swap needed: the DB row already carries `fresh.id`.
    if (persist && workoutId) {
      try {
        await addSetApi(workoutId, exId, { id: fresh.id, type: 'normal', done: false });
      } catch {
        return; // insert failed — don't show a set that isn't persisted
      }
    }
    setExercises((prev) =>
      prev.map((e) => (e.id === exId ? { ...e, sets: [...e.sets, fresh] } : e)),
    );
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
      removeWorkoutExercise(workoutId, exId).catch(() => {});
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
    if (persist && workoutId) deleteSetApi(setId).catch(() => {});
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

  const onDiscard = () => {
    Alert.alert('Discard workout?', 'Nothing from this session will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => void discardAndLeave() },
    ]);
  };

  const setRest = (exId: string, seconds: number) =>
    setExercises((prev) => prev.map((ex) => (ex.id === exId ? { ...ex, rest: seconds } : ex)));

  const onFinish = async () => {
    // Not on unmount: leaving the screen with the workout still running is
    // exactly when the card is useful (see the home screen's resume bar).
    void LiveActivity.end();
    stopWatchSession();
    forgetActiveWorkout();
    // Mirror the session to Apple Health (best-effort; never blocks finishing).
    // `startedAt` is the same stored origin the elapsed clock uses.
    if (startedAt != null) {
      void syncFinishedWorkout(workoutId, startedAt, Date.now(), watchRecordedRef.current);
    }
    if (persist && workoutId) {
      try {
        // Land any in-flight weight/reps edits before finishWorkout reads the DB to
        // compute volume/PRs — otherwise a value typed within the last 600ms is lost.
        await flushPending();
        const summary = await finishWorkout(workoutId);
        saveSummary(workoutId, summary);
        router.replace(`/summary/${workoutId}`);
        return;
      } catch {
        // fall through — best-effort fallback below
      }
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // --- Apple Watch companion: mirror state to the Watch, apply its controls ---
  const watchState = useMemo(
    () =>
      buildWatchState(
        exercises,
        name || 'Workout',
        { resting: restRemaining > 0, remaining: restRemaining, total: restTotal },
        (sets, i) => resolveSet(sets[i], carryFor(sets, i)),
      ),
    [exercises, name, restRemaining, restTotal],
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
        patchSet(st.currentExerciseId, st.currentSetId, {
          weight: a.weight,
          reps: a.reps,
          done: true,
        });
        if (persist) {
          write(
            patchSetApi(st.currentSetId, {
              weight: a.weight === '' ? null : Number(a.weight),
              reps: a.reps === '' ? null : Number(a.reps),
              done: true,
            }),
          );
        }
        if (ex) startRest(ex.rest, ex.name);
        break;
      }
      case 'adjustRest':
        setRestRemaining((r) => Math.max(0, r + a.seconds));
        setRestEndsAt((e) => (e == null ? e : Math.max(Date.now(), e + a.seconds * 1000)));
        if (a.seconds > 0) setRestTotal((t) => Math.max(t, restRemaining + a.seconds));
        break;
      case 'skipRest':
        endRest();
        break;
      case 'end':
        void onFinish();
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

  useEffect(() => {
    const offAction = onWatchAction((a) => applyWatchAction.current(a));
    const offMetrics = onWatchMetrics(({ bpm }) => {
      watchRecordedRef.current = true;
      if (bpm > 0) setHeartRate(bpm);
    });
    return () => {
      offAction();
      offMetrics();
    };
  }, []);

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
        unit="kg"
        sets={String(doneSets)}
        onBack={() => {
          forgetActiveWorkout();
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)');
        }}
        onFinish={onFinish}
        onDiscard={onDiscard}
        heartRate={heartRate}
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
            <ExerciseCard
              key={ex.id}
              exercise={ex}
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
              onOpenDetail={
                ex.exerciseCatalogId
                  ? () => router.push(`/exercise/${ex.exerciseCatalogId}`)
                  : undefined
              }
            />
          ))}

          <Pressable
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
          </Pressable>

          <View style={styles.spacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Done bar floated just above the keyboard — the numeric keypads have no
          return key, so this is their only dismiss affordance. Positioned by the
          live keyboard height because InputAccessoryView does not render under the
          New Architecture. iOS-only; shown only while the keyboard is up. */}
      {Platform.OS === 'ios' && kbHeight > 0 && (
        <View style={[styles.kbdAccessory, { bottom: kbHeight }]}>
          <Pressable
            onPress={() => Keyboard.dismiss()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Hide keyboard"
          >
            <Text style={styles.kbdAccessoryDone}>Done</Text>
          </Pressable>
        </View>
      )}

      <RestBar
        resting={restRemaining > 0}
        remaining={restRemaining}
        total={restTotal}
        onStart={() => startRest(DEFAULT_REST)}
        onMinus15={() => {
          setRestRemaining((r) => Math.max(0, r - 15));
          setRestEndsAt((e) => (e == null ? e : Math.max(Date.now(), e - 15_000)));
        }}
        onPlus15={() => {
          setRestRemaining((r) => r + 15);
          setRestTotal((t) => Math.max(t, restRemaining + 15));
          setRestEndsAt((e) => (e == null ? e : e + 15_000));
        }}
        onSkip={endRest}
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
  spacer: { height: 90 },
  kbdAccessory: {
    position: 'absolute',
    left: 0,
    right: 0,
    // `bottom` is set inline to the live keyboard height so the bar floats just
    // above the keyboard.
    height: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.surface2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  kbdAccessoryDone: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    color: color.accent,
    paddingHorizontal: 6,
  },
});
