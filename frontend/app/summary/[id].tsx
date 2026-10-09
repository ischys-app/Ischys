/**
 * Workout Summary screen. Renders the WorkoutSummaryOut returned by
 * POST /workouts/{id}/finish (stashed in `summaryCache`). Falls back to
 * getWorkout(id) with a degraded view (no PRs, computed muscle volume) if
 * the cache entry is missing — e.g. deep link / cold start.
 *
 * Source of truth: `export/ischys-app/Workout Summary.dc.html`.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type {
  RoutineExerciseIn,
  RoutineOut,
  WorkoutOut,
  WorkoutSetOut,
  WorkoutSummaryOut,
} from '../../src/api/types';
import { getWorkout, saveAsRoutine } from '../../src/api/workouts';
import { deleteRoutine, getRoutine, updateRoutine } from '../../src/api/routines';
import { parseServerDate } from '../../src/lib/serverTime';
import { CheckIcon, PencilIcon, ReorderArrowsIcon, StarIcon } from '../../src/components/icons';
import { PressableScale } from '../../src/components/PressableScale';
import { ShareWorkoutSheet } from '../../src/components/ShareWorkoutSheet';
import { buildRoutineDiff } from '../../src/domain/routineDiff';
import {
  DELOAD_DAYS,
  DELOAD_FACTOR,
  shouldShowAdvisory,
  type DeloadAdvice,
} from '../../src/domain/deload';
import { deloadHistoryFor } from '../../src/data/deloadRepo';
import { getDeloadState, setDeloadState } from '../../src/lib/deloadState';
import { fmtDateOnly, fmtDuration } from '../../src/lib/format';
import { maybeRequestReviewAfterFinish } from '../../src/lib/reviewPrompt';
import { getSummary } from '../../src/lib/summaryCache';
import { recordDeltaDisplay, recordDisplay } from '../../src/domain/records';
import { effortLabel, type EffortScaleKind } from '../../src/domain/effort';
import { countWorkingSets } from '../../src/domain/stats';
import { type Unit, volumeText, weightText } from '../../src/domain/units';
import { useEffortMode } from '../../src/lib/effortMode';
import { useWeightUnit } from '../../src/lib/weightUnit';
import { color, font } from '../../src/theme/tokens';
import { textScale } from '../../src/theme/textScale';

/** Extract HH:MM in local time from an ISO string. */
function hhmm(iso: string): string {
  const d = new Date(parseServerDate(iso));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatWhen(startedAt: string, endedAt: string | null | undefined): string {
  const dateStr = fmtDateOnly(startedAt);
  const start = hhmm(startedAt);
  if (!endedAt) return `${dateStr} · ${start}`;
  return `${dateStr} · ${start} – ${hhmm(endedAt)}`;
}

/**
 * Pick the "best" set for the row subtitle. Stored kilograms, shown in `unit`.
 * With effort ratings on, a rated best set carries its rating as a suffix —
 * "68 × 5 @9" — and an unrated one reads exactly as before.
 */
function bestSetLine(sets: WorkoutSetOut[], unit: Unit, effort: EffortScaleKind | null): string {
  const working = sets.filter((s) => s.done && s.type !== 'warmup');
  // No working set done: the same count the row's right-hand figure and the
  // header use, so a warm-up alone does not read as a set here and not there.
  if (working.length === 0) return `${countWorkingSets(sets)} sets`;
  let best = working[0];
  for (const s of working) {
    const bw = s.weight ?? -Infinity;
    const bbest = best.weight ?? -Infinity;
    if (bw > bbest) best = s;
  }
  const w = best.weight == null ? 'BW' : `${weightText(best.weight, unit)}${unit}`;
  const r = best.reps ?? 0;
  const rated = effort && best.rpe != null ? ` ${effortLabel(best.rpe, effort)}` : '';
  return `Best set · ${w} × ${r}${rated}`;
}

/** Compute a degraded volume-by-muscle from a WorkoutOut for the fallback view. */
function computeMuscleFromWorkout(w: WorkoutOut): { name: string; sets: number }[] {
  const tally = new Map<string, number>();
  for (const we of w.exercises) {
    const primary = we.exercise.primary_muscle?.group ?? we.exercise.primary_muscle?.name;
    if (!primary) continue;
    const done = we.sets.filter((s) => s.done && s.type !== 'warmup').length;
    if (done === 0) continue;
    tally.set(primary, (tally.get(primary) ?? 0) + done);
  }
  return Array.from(tally.entries())
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets);
}

// --- Routine-update prompt (Need 2) -----------------------------------------

/**
 * Workouts whose routine-update prompt has already been resolved (updated, kept,
 * or saved-as-new) this app session. Module scope = the session — re-entering the
 * same Summary won't re-ask, but the next session's changes are a fresh question.
 * Deliberately keyed by workout, not routine ("remembered per session, not per
 * routine" — declining once must not suppress the prompt for that routine forever).
 */
const resolvedPrompts = new Set<string>();

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Map a full routine payload back to the update-input shape (for Undo). */
function routineToInput(routine: RoutineOut): RoutineExerciseIn[] {
  return routine.exercises.map((re) => ({
    exercise_id: re.exercise.id,
    rest_seconds: re.rest_seconds,
    note: re.note ?? null,
    sets: re.sets.map((s) => ({ type: s.type, target_weight: s.target_weight, target_reps: s.target_reps })),
  }));
}

/** Map the finished workout's structure to the update-input shape (Update routine
 *  writes the plan to match what was just done — mirrors saveAsRoutine's mapping). */
function workoutToInput(workout: WorkoutOut): RoutineExerciseIn[] {
  return workout.exercises.map((we) => ({
    exercise_id: we.exercise.id,
    rest_seconds: we.rest_seconds,
    note: we.note ?? null,
    sets: we.sets.map((s) => ({ type: s.type, target_weight: s.weight, target_reps: s.reps })),
  }));
}

function CloseIcon({ size = 16, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={tint}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShareIcon({ size = 14, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"
        stroke={tint}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function WorkoutSummary() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; justFinished?: string }>();
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;
  const unit = useWeightUnit();
  const effortMode = useEffortMode();
  const effortKind = effortMode === 'off' ? null : effortMode;
  const justFinished =
    (Array.isArray(params.justFinished) ? params.justFinished[0] : params.justFinished) === '1';

  // Ask for an App Store review only after a *genuine* finish (justFinished=1),
  // never when viewing a past workout's summary from History. Fired best-effort
  // after mount — non-blocking, and it can never throw into this render.
  useEffect(() => {
    if (!justFinished || !workoutId) return;
    void maybeRequestReviewAfterFinish(workoutId);
  }, [justFinished, workoutId]);

  const [summary, setSummary] = useState<WorkoutSummaryOut | null>(() =>
    workoutId ? getSummary(workoutId) : null,
  );
  const [fallbackWorkout, setFallbackWorkout] = useState<WorkoutOut | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Fallback: no cached summary (deep-link / refresh) → best-effort getWorkout.
  useEffect(() => {
    if (summary || !workoutId) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkout(workoutId);
        if (!cancelled) setFallbackWorkout(w);
      } catch {
        // No workout has this id: an empty shell says nothing, so leave.
        if (cancelled) return;
        if (router.canGoBack()) router.back();
        else router.replace('/(tabs)');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary, workoutId, router]);

  // Coming back from Edit (#83): show the workout as it now is. Whichever of
  // the two sources this screen was already rendering is the one refreshed, so
  // a workout opened from History stays the plain view it was, and one just
  // finished keeps its records banner — recomputed by the save.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (!workoutId) return;
      if (summary) {
        const cached = getSummary(workoutId);
        if (cached && cached !== summary) setSummary(cached);
        return;
      }
      let cancelled = false;
      void getWorkout(workoutId)
        .then((w) => {
          if (!cancelled) setFallbackWorkout(w);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [workoutId, summary]),
  );

  // Unified view model — either the cached summary or the degraded fallback.
  const view = useMemo(() => {
    if (summary) {
      return {
        workout: summary.workout,
        prs: summary.prs,
        muscles: summary.volume_by_muscle,
      };
    }
    if (fallbackWorkout) {
      return {
        workout: fallbackWorkout,
        prs: [] as WorkoutSummaryOut['prs'],
        muscles: computeMuscleFromWorkout(fallbackWorkout),
      };
    }
    return null;
  }, [summary, fallbackWorkout]);

  // Pop back to wherever we came from (History, Home, or — after finishing, where
  // the workout screen replaced itself — the tab we started on). Only fall back to
  // Home when there is no back stack; replacing with '/(tabs)' unconditionally
  // stacked a second Home on top of the existing one.
  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const onDone = dismiss;
  const onClose = dismiss;
  const onSaveAsRoutine = async () => {
    if (workoutId) {
      try {
        await saveAsRoutine(workoutId);
      } catch {
        // Nothing was stored. Stay here, so the button can be tapped again.
        Alert.alert('Couldn’t save routine', 'Nothing was changed. Try again.');
        return;
      }
    }
    dismiss();
  };

  // --- Routine-update prompt (Need 2) ---------------------------------------
  // Only on the cached-summary path: the routine-backed workout is the mirror of
  // the `!routine_id` Save-as-Routine button. The degraded getWorkout fallback
  // has no diff available, so it never prompts (routineId stays null there).
  const routineId = summary ? summary.workout.routine_id ?? null : null;
  const [routine, setRoutine] = useState<RoutineOut | null>(null);
  const [routineDeleted, setRoutineDeleted] = useState(false);
  const [promptState, setPromptState] = useState<'prompt' | 'updated' | 'saved-new' | 'kept'>(
    'prompt',
  );
  const [expanded, setExpanded] = useState(false);
  const [receiptName, setReceiptName] = useState('');
  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const receiptFade = useRef(new Animated.Value(0)).current;
  // Resolved on a previous visit this session → don't re-ask on re-entry.
  const alreadyResolved = useRef(resolvedPrompts.has(workoutId ?? ''));

  // Load the source routine to diff against. A throw means it was deleted
  // mid-session → leave `routine` null so we fall back to Save as Routine.
  useEffect(() => {
    if (!routineId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await getRoutine(routineId);
        if (!cancelled) setRoutine(r);
      } catch {
        // Deleted source routine — never offer to update something gone; fall
        // back to the Save as Routine button instead.
        if (!cancelled) setRoutineDeleted(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routineId]);

  const diff = useMemo(
    () => (routine && summary ? buildRoutineDiff(routine, summary.workout) : []),
    [routine, summary],
  );

  const showReceipt = (state: 'updated' | 'saved-new') => {
    resolvedPrompts.add(workoutId ?? '');
    setPromptState(state);
    receiptFade.setValue(0);
    Animated.timing(receiptFade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const onUpdateRoutine = async () => {
    if (!routineId || !routine || !summary) return;
    const snapshot = routineToInput(routine); // captured for Undo
    try {
      await updateRoutine(routineId, { exercises: workoutToInput(summary.workout) });
    } catch {
      // The routine is as it was. No receipt for a change that did not
      // happen; the prompt stays, so it can be tried again.
      Alert.alert('Couldn’t update routine', 'Nothing was changed. Try again.');
      return;
    }
    setReceiptName(routine.name);
    undoRef.current = async () => {
      try {
        await updateRoutine(routineId, { exercises: snapshot });
      } catch {
        // best-effort revert
      }
    };
    showReceipt('updated');
  };

  const onKeepAsIs = () => {
    // A no-op write — nothing to confirm. Dismiss in place and remember for the
    // session (a green "success" receipt here would misuse the confirmed-data colour).
    resolvedPrompts.add(workoutId ?? '');
    setPromptState('kept');
  };

  const onSaveAsNew = async () => {
    if (!workoutId || !summary) return;
    const created = await saveAsRoutine(workoutId).catch(() => null);
    if (!created) {
      // No routine was stored, so no receipt saying one was.
      Alert.alert('Couldn’t save routine', 'Nothing was changed. Try again.');
      return;
    }
    setReceiptName(created.name);
    undoRef.current = async () => {
      try {
        await deleteRoutine(created.id);
      } catch {
        // best-effort
      }
    };
    showReceipt('saved-new');
  };

  const onUndo = async () => {
    const fn = undoRef.current;
    undoRef.current = null;
    if (fn) await fn();
    resolvedPrompts.delete(workoutId ?? '');
    setPromptState('prompt');
  };

  // These must stay above the `!view` return below: that early return used to
  // sit between the hooks, so a workout opened without a warm summary cache
  // (an import, a deep link, History after a restart) rendered the shell first,
  // then the real screen with more hooks than the previous render, and React
  // threw. Hooks run unconditionally; only the JSX is allowed to branch.
  // The prompt is eligible only for a routine-backed workout on the cached path
  // whose structure actually changed and that hasn't been resolved this session.
  const canPrompt = !alreadyResolved.current && !!summary && !!routineId && !!routine && diff.length > 0;

  // --- stall / deload advisory (#70) ---------------------------------------
  // Deliberately second in line: if the routine prompt also applies it wins,
  // because that one is about the session just finished and this one is about
  // the weeks around it. Two cards would be a list, and the design is explicit
  // that this never becomes one.
  const [advice, setAdvice] = useState<DeloadAdvice | null>(null);
  const [adviceState, setAdviceState] = useState<'prompt' | 'accepted'>('prompt');

  useEffect(() => {
    if (!summary || canPrompt) return;
    let alive = true;
    void (async () => {
      const state = await getDeloadState();
      if (!alive || !state.enabled) return;
      // The detectors live in domain/deload; everything this screen does is
      // decide whether there is room to say it.
      const { exercises, historyStartedAt } = await deloadHistoryFor(summary.workout.id);
      const found = shouldShowAdvisory({
        enabled: state.enabled,
        now: Date.now(),
        historyStartedAt,
        lastShownAt: state.lastShownAt,
        // A session that set a PR is the worst possible moment to suggest
        // backing off, whatever the trend says.
        prThisSession: (summary.prs?.length ?? 0) > 0,
        exercises: exercises.map((e) => ({
          ...e,
          dismissedAt: state.dismissed[e.exerciseId] ?? null,
        })),
      });
      if (alive) setAdvice(found);
    })();
    return () => {
      alive = false;
    };
  }, [summary, canPrompt]);

  // Empty shell while the fallback is loading (or if it never loads).
  if (!view) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: 56 + insets.top }]}>
          <Pressable
          style={styles.headerBtn}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
            <CloseIcon tint={color.text2} />
          </Pressable>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.headerTitle} numberOfLines={1}>
            WORKOUT
          </Text>
          {/* Layout spacer only — no surface fill, no press target. */}
          <View style={styles.headerSpacer} />
        </View>
      </View>
    );
  }

  const { workout, prs, muscles } = view;
  const maxSets = muscles.length > 0 ? Math.max(...muscles.map((m) => m.sets)) : 0;

  const onAcceptDeload = async () => {
    if (!advice) return;
    const state = await getDeloadState();
    await setDeloadState({
      ...state,
      lastShownAt: Date.now(),
      // A window, never weights. progression.ts reads this and suggests lighter
      // numbers while it is open; nothing is written to any set.
      activeUntil: { ...state.activeUntil, [advice.exerciseId]: Date.now() + DELOAD_DAYS * 86400000 },
    });
    setAdviceState('accepted');
  };

  const onDismissDeload = async () => {
    if (!advice) return;
    const state = await getDeloadState();
    await setDeloadState({
      ...state,
      lastShownAt: Date.now(),
      dismissed: { ...state.dismissed, [advice.exerciseId]: Date.now() },
    });
    setAdvice(null);
  };

  const onUndoDeload = async () => {
    if (!advice) return;
    const state = await getDeloadState();
    const next = { ...state.activeUntil };
    delete next[advice.exerciseId];
    await setDeloadState({ ...state, activeUntil: next });
    setAdviceState('prompt');
  };

  const visibleRows = expanded ? diff : diff.slice(0, 3);
  const hiddenCount = diff.length - visibleRows.length;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 104 + insets.top },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.checkBadge}>
            <CheckIcon size={30} color={color.accentFg} strokeWidth={3} />
          </View>
          <Text maxFontSizeMultiplier={textScale.display} style={styles.workoutName}>{workout.name}</Text>
          <Text maxFontSizeMultiplier={textScale.control} style={styles.workoutWhen}>
            {formatWhen(workout.started_at, workout.ended_at)}
          </Text>
        </View>

        {/* STAT GRID */}
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>DURATION</Text>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>
              {fmtDuration(workout.duration_seconds)}
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statUnit}></Text>
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>VOLUME</Text>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>
              {volumeText(workout.total_volume, unit)}
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statUnit}> {unit}</Text>
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>SETS</Text>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>{workout.total_sets}</Text>
          </View>
        </View>

        {/* PR BANNER */}
        {prs.length > 0 && (
          <View style={styles.prBanner}>
            <View style={styles.prHeader}>
              <StarIcon size={17} color={color.success} strokeWidth={2.4} />
              <Text maxFontSizeMultiplier={textScale.control} style={styles.prHeaderText}>
                {`${prs.length} New Personal Record${prs.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.prRows}>
              {prs.map((pr, i) => (
                <View key={`${pr.exercise_id}-${pr.metric}-${i}`} style={styles.prRow}>
                  <Text maxFontSizeMultiplier={textScale.display} style={styles.prName} numberOfLines={1} ellipsizeMode="tail">
                    {pr.exercise_name}
                  </Text>
                  <Text maxFontSizeMultiplier={textScale.display} style={styles.prValue}>
                    {recordDisplay(pr.metric, pr.value, pr.display, unit)}{' '}
                    <Text maxFontSizeMultiplier={textScale.display} style={styles.prDelta}>
                      {recordDeltaDisplay(pr.metric, pr.delta, unit)}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* EXERCISE BREAKDOWN */}
        <Text maxFontSizeMultiplier={textScale.control} style={styles.sectionLabel}>
          {`EXERCISES · ${workout.exercises.length}`}
        </Text>
        <View style={styles.exerciseList}>
          {workout.exercises.map((we) => {
            const anyPr = we.sets.some((s) => s.is_pr);
            return (
              <View key={we.id} style={styles.exerciseRow}>
                <View style={styles.avatar}>
                  <Text maxFontSizeMultiplier={textScale.fixed} style={styles.avatarText}>{we.exercise.initials}</Text>
                </View>
                <View style={styles.exerciseText}>
                  <Text maxFontSizeMultiplier={textScale.display} style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">
                    {we.exercise.name}
                  </Text>
                  <Text maxFontSizeMultiplier={textScale.control} style={styles.exerciseBest}>{bestSetLine(we.sets, unit, effortKind)}</Text>
                </View>
                {anyPr && <StarIcon size={15} color={color.success} strokeWidth={2.4} />}
                {/* Sets done, by the header's rule (countWorkingSets): one planned
                    and left unticked is not a set, and neither is a warm-up. */}
                <Text maxFontSizeMultiplier={textScale.fixed} style={styles.exerciseSetCount}>{`${countWorkingSets(we.sets)} sets`}</Text>
              </View>
            );
          })}
        </View>

        {/* MUSCLE SPLIT */}
        {muscles.length > 0 && (
          <>
            <Text maxFontSizeMultiplier={textScale.control} style={styles.sectionLabel}>VOLUME BY MUSCLE</Text>
            <View style={styles.muscleCard}>
              {muscles.map((m) => {
                const pct = maxSets > 0 ? (m.sets / maxSets) * 100 : 0;
                return (
                  <View key={m.name} style={styles.muscleRow}>
                    <View style={styles.muscleHeader}>
                      <Text maxFontSizeMultiplier={textScale.control} style={styles.muscleName}>{m.name}</Text>
                      <Text maxFontSizeMultiplier={textScale.fixed} style={styles.muscleSets}>{`${m.sets} sets`}</Text>
                    </View>
                    <View style={styles.muscleTrack}>
                      <View style={[styles.muscleBar, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ACTIONS */}
        <View style={styles.actions}>
          {/* Routine-update prompt sits directly above Done — the question
              arrives as the user is leaving, not while reading their PRs. */}
          {/* Stall / deload advisory. Shown only when the routine prompt is not:
              two cards would be a list, and the design is explicit that this
              never becomes one. No accent anywhere — backing off is not the
              action the app is encouraging, it is one it is offering. */}
          {!canPrompt && advice && adviceState === 'prompt' && (
            <View style={styles.deloadCard}>
              <View style={styles.routineHeader}>
                <View style={styles.deloadDot} />
                <Text style={styles.routineTitle}>
                  {advice.reason === 'stall' ? 'This lift has stalled' : 'Volume jumped fast'}
                </Text>
              </View>
              <Text style={styles.deloadBody}>
                {advice.reason === 'stall'
                  ? `No new best in a while. A week at ${Math.round(DELOAD_FACTOR * 100)}% often moves it further than pushing does.`
                  : `This has climbed quickly. Holding for ${DELOAD_DAYS} days lets it catch up.`}
              </Text>
              <View style={styles.routineActions}>
                <Pressable style={styles.deloadAccept} onPress={() => void onAcceptDeload()}>
                  <Text maxFontSizeMultiplier={textScale.control} style={styles.deloadAcceptText}>
                    {advice.reason === 'stall'
                      ? `Ease off for ${DELOAD_DAYS} days`
                      : `Hold for ${DELOAD_DAYS} days`}
                  </Text>
                </Pressable>
                <Pressable style={styles.keepBtn} onPress={() => void onDismissDeload()}>
                  <Text maxFontSizeMultiplier={textScale.control} style={styles.keepBtnText}>Not now</Text>
                </Pressable>
              </View>
            </View>
          )}

          {!canPrompt && advice && adviceState === 'accepted' && (
            <View style={styles.receiptCard}>
              <View style={styles.receiptCheck}>
                <CheckIcon size={14} color={color.success} strokeWidth={3.2} />
              </View>
              <Text style={styles.deloadBody}>
                {`Suggestions will read ${Math.round(DELOAD_FACTOR * 100)}% for ${DELOAD_DAYS} days. Nothing was written to your sets.`}
              </Text>
              <Pressable onPress={() => void onUndoDeload()} hitSlop={6}>
                <Text style={styles.saveNewLink}>Undo</Text>
              </Pressable>
            </View>
          )}

          {canPrompt && promptState === 'prompt' && (
            <View style={styles.routineCard}>
              <View style={styles.routineHeader}>
                <View style={styles.routineDot} />
                <Text style={styles.routineTitle}>You changed this routine</Text>
                <Text maxFontSizeMultiplier={textScale.fixed} style={styles.routineCount}>{plural(diff.length, 'change')}</Text>
              </View>
              <View style={styles.routineRows}>
                {visibleRows.map((row) => (
                  <View key={row.key} style={styles.routineRow}>
                    <View style={styles.routineMarker}>
                      {row.marker === 'added' && <Text maxFontSizeMultiplier={textScale.fixed} style={styles.markerAdd}>+</Text>}
                      {row.marker === 'removed' && <Text maxFontSizeMultiplier={textScale.fixed} style={styles.markerRemove}>{'−'}</Text>}
                      {row.marker === 'changed' && (
                        <ReorderArrowsIcon size={13} color={color.text2} strokeWidth={2.2} />
                      )}
                    </View>
                    <Text style={styles.routineName} numberOfLines={1} ellipsizeMode="tail">
                      {row.name}
                    </Text>
                    <Text style={row.marker === 'changed' ? styles.routineDetailStrong : styles.routineDetail}>
                      {row.detail}
                    </Text>
                  </View>
                ))}
                {hiddenCount > 0 && (
                  <Pressable style={styles.routineMoreRow} onPress={() => setExpanded(true)}>
                    <View style={styles.routineMarker} />
                    <Text style={styles.routineMore}>{`and ${hiddenCount} more change${hiddenCount === 1 ? '' : 's'}`}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.routineActions}>
                <Pressable style={styles.updateBtn} onPress={() => void onUpdateRoutine()}>
                  <Text maxFontSizeMultiplier={textScale.control} style={styles.updateBtnText}>Update routine</Text>
                </Pressable>
                <Pressable style={styles.keepBtn} onPress={onKeepAsIs}>
                  <Text maxFontSizeMultiplier={textScale.control} style={styles.keepBtnText}>Keep as-is</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => void onSaveAsNew()} hitSlop={6}>
                <Text style={styles.saveNewLink}>Save as a new routine instead</Text>
              </Pressable>
            </View>
          )}

          {canPrompt && (promptState === 'updated' || promptState === 'saved-new') && (
            <Animated.View style={[styles.receiptCard, { opacity: receiptFade }]}>
              <View style={styles.receiptCheck}>
                <CheckIcon size={14} color={color.success} strokeWidth={3.2} />
              </View>
              <View style={styles.receiptText}>
                <Text style={styles.receiptTitle}>
                  {promptState === 'updated' ? 'Routine updated' : 'Saved as new routine'}
                </Text>
                <Text style={styles.receiptSub}>
                  {promptState === 'updated'
                    ? `${receiptName} · ${plural(diff.length, 'change')} saved`
                    : `${receiptName} · added to routines`}
                </Text>
              </View>
              <Pressable onPress={() => void onUndo()} hitSlop={8}>
                <Text style={styles.receiptUndo}>Undo</Text>
              </Pressable>
            </Animated.View>
          )}

          <PressableScale style={styles.doneBtn} onPress={onDone}>
            <Text maxFontSizeMultiplier={textScale.control} style={styles.doneBtnText}>Done</Text>
          </PressableScale>
          {/* A session started from a routine already has one; offering to save
              it again would just duplicate that routine. Exception: the source
              routine was deleted mid-session — then this is the correct fallback. */}
          {(!workout.routine_id || routineDeleted) && (
            <Pressable style={styles.saveRoutineBtn} onPress={onSaveAsRoutine}>
              <Text maxFontSizeMultiplier={textScale.control} style={styles.saveRoutineBtnText}>Save as Routine</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* HEADER (absolute, on top of scroll) */}
      <View style={[styles.header, { paddingTop: 56 + insets.top }]}>
        <Pressable
          style={styles.headerBtn}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <CloseIcon tint={color.text2} />
        </Pressable>
        <Text maxFontSizeMultiplier={textScale.fixed} style={styles.headerTitle} numberOfLines={1}>
          WORKOUT
        </Text>
        {/* Edit sits before Share and is surface2 like it, so Done stays the
            screen's only accent. Only a finished workout is history to edit. */}
        {workout.status === 'completed' ? (
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push(`/workout/edit/${workout.id}`)}
            hitSlop={HEADER_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Edit workout"
          >
            <PencilIcon size={14} color={color.text1} strokeWidth={2.2} />
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.editBtnText}>Edit</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.shareBtn}
          onPress={() => setShareOpen(true)}
          hitSlop={HEADER_SLOP}
        >
          <ShareIcon tint={color.text2} />
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.shareBtnText}>Share</Text>
        </Pressable>
      </View>

      <ShareWorkoutSheet
        visible={shareOpen}
        summary={
          summary ??
          (fallbackWorkout
            ? {
                workout: fallbackWorkout,
                prs: [],
                volume_by_muscle: muscles,
              }
            : null)
        }
        onClose={() => setShareOpen(false)}
      />
    </View>
  );
}

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Edit and Share sit 8pt apart, so the old 8pt slop on every side would make
 * their touch areas overlap. 5pt above and below still takes 34 to 44.
 */
const HEADER_SLOP = { top: 5, bottom: 5, left: 4, right: 4 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },

  // HEADER
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(10,10,11,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 34, height: 34 },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
  },
  editBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text1,
  },
  shareBtn: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text2,
  },

  // SCROLL
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // HERO
  hero: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 26,
  },
  checkBadge: {
    width: 60,
    height: 60,
    borderRadius: 17,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: color.accent,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  workoutName: {
    fontFamily: font.displayBold,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
    textAlign: 'center',
  },
  workoutWhen: {
    fontFamily: font.monoRegular,
    fontSize: 12.5,
    color: color.text2,
    marginTop: 4,
    textAlign: 'center',
    fontVariant: tabular,
  },

  // STAT GRID
  statGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCell: {
    flex: 1,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
  },
  statLabel: {
    fontFamily: font.monoMedium,
    fontSize: 9,
    letterSpacing: 0.9,
    color: color.text3,
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 21,
    letterSpacing: -0.42,
    color: color.text1,
    fontVariant: tabular,
  },
  statUnit: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    color: color.text3,
  },

  // PR BANNER
  prBanner: {
    backgroundColor: 'rgba(45,216,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(45,216,129,0.28)',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  prHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  prHeaderText: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: color.success,
  },
  prRows: {
    gap: 8,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    color: color.text1,
  },
  prValue: {
    fontFamily: font.monoSemi,
    fontSize: 13,
    color: color.text1,
    fontVariant: tabular,
  },
  prDelta: {
    color: color.success,
  },

  // EXERCISES
  sectionLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  exerciseList: {
    gap: 8,
    marginBottom: 26,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.monoSemi,
    fontSize: 12,
    color: color.accent,
  },
  exerciseText: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    letterSpacing: -0.14,
    color: color.text1,
  },
  exerciseBest: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 1,
    fontVariant: tabular,
  },
  exerciseSetCount: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    fontVariant: tabular,
  },

  // MUSCLE SPLIT
  muscleCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 26,
    gap: 13,
  },
  muscleRow: {
    gap: 6,
  },
  muscleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muscleName: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: color.text1,
  },
  muscleSets: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    fontVariant: tabular,
  },
  muscleTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: color.surface3,
    overflow: 'hidden',
  },
  muscleBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: color.accent,
  },

  // ACTIONS
  actions: {
    gap: 10,
  },
  doneBtn: {
    height: 50,
    borderRadius: 13,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
  saveRoutineBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRoutineBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },

  // ROUTINE-UPDATE PROMPT (Need 2)
  deloadCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  // Warning, not error: this is the colour the design system already assigns to
  // "deload, missed", and the advisory is not a failure.
  deloadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.warning },
  deloadBody: { fontFamily: font.bodyRegular, fontSize: 13, lineHeight: 19, color: color.text2 },
  deloadAccept: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deloadAcceptText: { fontFamily: font.titleSemi, fontSize: 14, color: color.text1 },
  routineCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
  },
  routineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  routineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: color.accent,
    flexShrink: 0,
  },
  routineTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.titleSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.text1,
  },
  routineCount: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    flexShrink: 0,
  },
  routineRows: {
    gap: 9,
    marginTop: 14,
  },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routineMarker: {
    width: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  markerAdd: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    color: color.success,
    textAlign: 'center',
  },
  markerRemove: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    color: color.error,
    textAlign: 'center',
  },
  routineName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    color: color.text1,
  },
  routineDetail: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    flexShrink: 0,
    fontVariant: tabular,
  },
  routineDetailStrong: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text2,
    flexShrink: 0,
    fontVariant: tabular,
  },
  routineMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 3,
  },
  routineMore: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    textDecorationLine: 'underline',
  },
  routineActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  updateBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: color.surface3,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
  },
  keepBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text2,
  },
  saveNewLink: {
    textAlign: 'center',
    marginTop: 13,
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: color.text3,
    textDecorationLine: 'underline',
  },

  // RESOLVED RECEIPT (R3)
  receiptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: 'rgba(45,216,129,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(45,216,129,0.26)',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  receiptCheck: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: 'rgba(45,216,129,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  receiptText: { flex: 1, minWidth: 0 },
  receiptTitle: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
  },
  receiptSub: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    marginTop: 2,
  },
  receiptUndo: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text2,
    textDecorationLine: 'underline',
    flexShrink: 0,
  },
});
