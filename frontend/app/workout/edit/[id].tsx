/**
 * Edit a completed workout (#83).
 *
 * Source of truth: design-handoff board 13a, frames E2–E8, and its follow-ups
 * on 13b: a removed exercise stays in place (E9–E11), and the Date & time
 * sheet says what Save does to the workout's Apple Health entry (E12–E14).
 *
 * A thin view over domain/workoutEdit.ts. Nothing is written until Save, and
 * Save is one transaction (data/workoutEditRepo.ts). The cards and set rows are
 * the live workout's own, in their edit mode; what makes this read as history
 * is what is missing — no clock, no HR strip, no rest timer, no ticks.
 *
 * This screen starts nothing: no Live Activity, no Watch session, no rest
 * notification, no HealthKit session. Its one dealing with Health comes after
 * a save that changed the workout's time: an entry Ischys wrote is moved to
 * match (#90), best-effort, and never as part of the save itself.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { ExerciseOut } from '../../../src/api/types';
import { PressableScale } from '../../../src/components/PressableScale';
import { ChevronDownIcon, PlusIcon } from '../../../src/components/icons';
import {
  DiscardSheet,
  SaveRecordsSheet,
  WhenSheet,
  type WhenField,
} from '../../../src/components/workout/EditWorkoutSheets';
import { ExerciseCard } from '../../../src/components/workout/ExerciseCard';
import {
  REMOVED_ROW_HEIGHT,
  RemovedExerciseRow,
} from '../../../src/components/workout/RemovedExerciseRow';
import { ReorderExercises } from '../../../src/components/workout/ReorderExercises';
import { SupersetSheet } from '../../../src/components/workout/SupersetSheet';
import { newId } from '../../../src/data/ids';
import {
  loadExerciseHistory,
  loadWorkoutForEdit,
  saveWorkoutEdit,
} from '../../../src/data/workoutEditRepo';
import {
  NO_TAIL,
  tailAfterCollapse,
  tailAfterRestore,
  tailAfterSettle,
  tailTotal,
} from '../../../src/domain/collapseTail';
import { healthEditLine, type HealthEditState } from '../../../src/domain/healthEntry';
import {
  addExercise,
  addSet,
  buildPlan,
  canToggleDone,
  collapseEffect,
  cycleSetType,
  editSetReps,
  editSetWeight,
  exerciseHint,
  exerciseRows,
  fmtCellDate,
  fmtClock,
  fmtHoursMinutes,
  joinSuperset,
  leaveSuperset,
  openEditSession,
  planCanSave,
  recordImpact,
  recordLine,
  recordsPending,
  removeExercise,
  removeSet,
  reorderExercises,
  replaceExercise,
  setWhen,
  toggleSetDone,
  undoRemoveExercise,
  wasLabel,
  type EditSession,
  type RecordContext,
} from '../../../src/domain/workoutEdit';
import { haptics } from '../../../src/lib/haptics';
import { loadHealthEditState, syncEditedWorkout } from '../../../src/lib/healthSync';
import { takePendingSelection } from '../../../src/lib/pendingSelection';
import { getWeightUnit } from '../../../src/lib/weightUnit';
import { color, font } from '../../../src/theme/tokens';

// The board's 56pt header inset is the status bar plus this.
const HEADER_TOP = 8;
const HEADER_ROW = 34;
const HEADER_BOTTOM = 12;
/** Scroll content starts 112pt down on the board: the header and 10pt of air. */
const CONTENT_GAP = 10;

/** The page background fading out under the header, as on the board. */
function HeaderFade() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id="editWorkoutHeaderFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset={0} stopColor={color.bg} stopOpacity={0.97} />
          <Stop offset={0.72} stopColor={color.bg} stopOpacity={0.97} />
          <Stop offset={1} stopColor={color.bg} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#editWorkoutHeaderFade)" />
    </Svg>
  );
}

const noop = () => {};

/**
 * Where a superset's rail starts and stops on each partner (E11): beside the
 * label on the first, across the 10pt gap between partners, and 6pt short of
 * the last one's foot.
 */
const RAIL = { underLabel: 9, fromAbove: -10, intoBelow: -14, end: 6 };

/** The air between two entries of the list. */
const LIST_GAP = 10;
/** A "SUPERSET A" label over a group, and the space under it. */
const SS_HEADER_HEIGHT = 22;
const SS_HEADER_GAP = 6;

/** A card folding down to its removed row, or back: the list below slides. */
const COLLAPSE = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.opacity,
);

export default function EditWorkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  const [session, setSession] = useState<EditSession | null>(null);
  const [records, setRecords] = useState<RecordContext | null>(null);
  /** What is known about the workout's Health entry. Null until it is. */
  const [health, setHealth] = useState<HealthEditState | null>(null);
  /** Nothing to edit: no such workout, or it is not a finished one. */
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Save was tapped and is waiting on a history load before it decides anything. */
  const [deciding, setDeciding] = useState(false);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openSetId, setOpenSetId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [supersetExId, setSupersetExId] = useState<string | null>(null);
  const [whenField, setWhenField] = useState<WhenField | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // The numeric keypads have no return key, so a Done bar floats above them,
  // as on the live workout (InputAccessoryView does not render under the New
  // Architecture).
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    if (!workoutId) {
      setMissing(true);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const ctx = await loadWorkoutForEdit(workoutId);
        if (!alive) return;
        if (!ctx) {
          setMissing(true);
          return;
        }
        // The unit the weight strings are written in is fixed for the life of
        // the edit, so a number is never shown or saved under another one.
        setSession(openEditSession(ctx.original, getWeightUnit()));
        setRecords(ctx.records);
        // Asked now, not when the Date & time sheet opens, so its Health line
        // is there on the sheet's first frame. A workout finished before
        // entries were recorded is looked up in Health here, once. Never
        // throws, and has no say in whether the workout can be edited.
        void loadHealthEditState(workoutId, ctx.original).then((state) => {
          if (alive) setHealth(state);
        });
      } catch {
        if (alive) setMissing(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workoutId]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKbHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const plan = useMemo(() => (session ? buildPlan(session) : null), [session]);
  const dirty = (plan?.changeCount ?? 0) > 0;
  // Also false while a set is half-typed or an exercise has no sets: the row
  // or the card says what is missing.
  const savable = !!plan && planCanSave(plan);
  // The list top to bottom: cards, and the rows removed ones left in place.
  const rows = useMemo(() => (session ? exerciseRows(session) : []), [session]);
  const cards = useMemo(() => rows.filter((r) => !r.removed).map((r) => r.exercise), [rows]);
  const impact = useMemo(
    () => (session && records ? recordImpact(session, records) : []),
    [session, records],
  );

  const edit = (fn: (s: EditSession) => EditSession) => setSession((s) => (s ? fn(s) : s));

  // What Save reads after waiting on something: the values of the latest
  // render, not of the one its handler was created in.
  const latest = useRef({ session, records });
  latest.current = { session, records };

  // --- leaving ---------------------------------------------------------------

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const onCancel = () => {
    // The transaction is already running; there is nothing left to cancel,
    // and leaving now would be followed by Save leaving a second time.
    if (saving || deciding) return;
    Keyboard.dismiss();
    if (dirty) setConfirmDiscard(true);
    else leave();
  };

  // Android's back button is the same exit as Cancel, so it gets the same sheet.
  useEffect(() => {
    if (!dirty) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving && !deciding) setConfirmDiscard(true);
      return true;
    });
    return () => sub.remove();
  }, [dirty, saving, deciding]);

  // --- saving ----------------------------------------------------------------

  /** The state lags a tap by a render; this does not. */
  const saveStarted = useRef(false);

  const save = async () => {
    const current = latest.current.session;
    if (!current || saveStarted.current) return;
    saveStarted.current = true;
    setSaving(true);
    const plan = buildPlan(current);
    try {
      await saveWorkoutEdit(plan);
    } catch {
      saveStarted.current = false;
      setSaving(false);
      setConfirmSave(false);
      haptics.error();
      Alert.alert('Couldn’t save', 'Nothing was changed. Try again.');
      return;
    }
    // The edit is committed. If it moved the workout in time, the Health
    // entry Ischys wrote follows it; not awaited, and unable to fail the save.
    void syncEditedWorkout(plan.workoutId, current.original, plan);
    haptics.success();
    setConfirmSave(false);
    // Opened from the Summary, which is right underneath. Opened from a
    // History row's menu, there is no Summary yet, so this becomes it.
    if (from === 'history' && workoutId) router.replace(`/summary/${workoutId}`);
    else leave();
  };

  /** History loads still in flight for exercises added or swapped in here. */
  const historyLoads = useRef(new Set<Promise<void>>());
  /** What they brought back, readable the moment they settle. */
  const loadedHistory = useRef<RecordContext['history']>({});

  const onSave = async () => {
    if (!savable || saving || deciding) return;
    Keyboard.dismiss();
    // An exercise picked a moment ago reports no record change until its
    // history is in. Deciding now would skip the sheet for exactly the edit
    // that needs it, so the decision waits for the loads still running.
    const withLoaded = (ctx: RecordContext): RecordContext => ({
      ...ctx,
      history: { ...loadedHistory.current, ...ctx.history },
    });
    const before = latest.current;
    if (
      before.session &&
      before.records &&
      historyLoads.current.size > 0 &&
      recordsPending(before.session, withLoaded(before.records))
    ) {
      setDeciding(true);
      await Promise.allSettled([...historyLoads.current]);
      setDeciding(false);
    }
    const now = latest.current;
    if (!now.session || !planCanSave(buildPlan(now.session))) return;
    // Most saves touch no record, and a dialog every time trains people to
    // tap through the one that matters.
    const moved = now.records ? recordImpact(now.session, withLoaded(now.records)) : [];
    if (moved.length > 0) setConfirmSave(true);
    else void save();
  };

  // --- exercises from the library --------------------------------------------

  /** Which exercise the library is picking a replacement for. */
  const replaceTarget = useRef<string | null>(null);

  const loadHistoryFor = (chosen: ExerciseOut) => {
    if (!workoutId) return;
    const load: Promise<void> = loadExerciseHistory(chosen.id, workoutId)
      .then((sessions) => {
        loadedHistory.current[chosen.id] ??= sessions;
        setRecords((r) =>
          r && !r.history[chosen.id] ? { ...r, history: { ...r.history, [chosen.id]: sessions } } : r,
        );
      })
      .catch(() => {})
      .finally(() => {
        historyLoads.current.delete(load);
      });
    historyLoads.current.add(load);
  };

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      const target = replaceTarget.current;
      replaceTarget.current = null;
      // Drained even on the first focus, so a pick left over from another
      // screen is never mistaken for one made here.
      const picked = takePendingSelection();
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (!picked || picked.length === 0) return;
      if (target) {
        const chosen = picked[0];
        const setId = newId();
        edit((s) => replaceExercise(s, target, chosen, setId));
        loadHistoryFor(chosen);
        return;
      }
      for (const chosen of picked) {
        const exId = newId();
        const setId = newId();
        edit((s) => addExercise(s, chosen, exId, setId));
        loadHistoryFor(chosen);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workoutId]),
  );

  const openLibrary = (replaceId: string | null) => {
    setOpenMenuId(null);
    Keyboard.dismiss();
    replaceTarget.current = replaceId;
    // Pick mode hands the choice back; nothing is written to the workout.
    router.push('/exercise-library?pick=1');
  };

  // --- removing an exercise, in place (13b) -----------------------------------

  /** Where the list is scrolled to, and how much of it there is. */
  const scroll = useRef({ y: 0, viewport: 0, content: 0 });
  const cardHeights = useRef(new Map<string, number>());
  /**
   * Extra room under the list. A card collapsing near the bottom leaves the
   * list too short for where it is scrolled to; the scroll view would pull
   * everything down to fit, and the row would jump away from the thumb that
   * just tapped Remove. This holds the scroll position valid instead, so the
   * row's top edge stays put. It is kept per collapsed card
   * (domain/collapseTail.ts): Undo gives that card's share back, and the rest
   * is let go once the user scrolls on.
   */
  const [tails, setTails] = useState(NO_TAIL);
  const tail = tailTotal(tails);

  const collapse = (exId: string) => {
    setOpenMenuId(null);
    const current = latest.current.session;
    if (current) {
      // What the list is about to be shorter by. A stored exercise folds down
      // to its row; one added in this edit goes altogether, with the gap
      // under it, and can take a superset label along. (If this empties the
      // workout, the "No sets" card arrives as well and the tail runs that
      // much long until the next scroll lets it go.)
      const card = cardHeights.current.get(exId) ?? 0;
      const effect = collapseEffect(current, exId);
      const lost =
        (effect.leavesRow ? card - REMOVED_ROW_HEIGHT : card + LIST_GAP) +
        effect.headersLost * (SS_HEADER_HEIGHT + SS_HEADER_GAP);
      const at = { ...scroll.current };
      setTails((t) => tailAfterCollapse(t, exId, at, lost));
    }
    LayoutAnimation.configureNext(COLLAPSE);
    edit((s) => removeExercise(s, exId));
  };

  const restore = (exId: string) => {
    LayoutAnimation.configureNext(COLLAPSE);
    // The card takes back the height its collapse was made up for, so that
    // padding goes in the same animation.
    setTails((t) => tailAfterRestore(t, exId));
    edit((s) => undoRemoveExercise(s, exId));
  };

  /** Once scrolling settles, keep only as much of the tail as still holds it there. */
  const releaseTail = () => {
    const at = { ...scroll.current };
    setTails((t) => tailAfterSettle(t, at));
  };

  // --- render ----------------------------------------------------------------

  const headerHeight = insets.top + HEADER_TOP + HEADER_ROW + HEADER_BOTTOM;
  const stored = session?.original;
  const durationMoved = !!session && !!stored && session.durationSeconds !== stored.durationSeconds;
  const dateMoved =
    !!session && !!stored && fmtCellDate(session.startedAt) !== fmtCellDate(stored.startedAt);
  const startMoved =
    !!session && !!stored && fmtClock(session.startedAt) !== fmtClock(stored.startedAt);
  const noSets = !!session && (plan?.setCount ?? 0) === 0;

  return (
    <View style={styles.root}>
      {/* Swipe-back would skip the discard sheet, so it is off while there is
          something to discard. */}
      <Stack.Screen options={{ gestureEnabled: !dirty }} />

      <KeyboardAvoidingView
        style={styles.flex}
        // Android draws edge-to-edge, so the window no longer shrinks for the
        // keyboard on its own; without this a field low on the screen is typed
        // into blind.
        behavior="padding"
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerHeight + CONTENT_GAP,
              paddingBottom: 40 + insets.bottom + tail,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scroll.current.y = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            scroll.current.viewport = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, height) => {
            scroll.current.content = height;
          }}
          onScrollEndDrag={(e) => {
            // No fling: there will be no momentum event to settle on.
            if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) releaseTail();
          }}
          onMomentumScrollEnd={releaseTail}
        >
          {!session && !missing && (
            <View style={styles.loading}>
              <ActivityIndicator color={color.text3} />
            </View>
          )}

          {missing && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Nothing to edit</Text>
              <Text style={styles.emptyBody}>
                This workout isn{'’'}t in your history any more.
              </Text>
            </View>
          )}

          {session && stored && (
            <>
              {/* DATE · START · DURATION */}
              <View style={styles.whenRow}>
                <WhenCell
                  label="DATE"
                  value={fmtCellDate(session.startedAt)}
                  was={dateMoved ? `was ${fmtCellDate(stored.startedAt)}` : null}
                  onPress={() => setWhenField('date')}
                />
                <WhenCell
                  label="START"
                  value={fmtClock(session.startedAt)}
                  was={startMoved ? `was ${fmtClock(stored.startedAt)}` : null}
                  onPress={() => setWhenField('start')}
                />
                <WhenCell
                  label="DURATION"
                  value={fmtHoursMinutes(session.durationSeconds)}
                  was={durationMoved ? `was ${fmtHoursMinutes(stored.durationSeconds)}` : null}
                  onPress={() => setWhenField('duration')}
                />
              </View>

              <View style={styles.list}>
                {rows.map((row) => {
                  const ex = row.exercise;
                  const grouped = ex.supersetGroup != null;
                  return (
                    <View key={ex.id} style={grouped ? styles.ssMember : undefined}>
                      {row.header ? (
                        <View
                          style={styles.ssHeader}
                          accessible
                          accessibilityLabel={`${row.header.label} ${row.header.note}`}
                        >
                          <Text style={styles.ssLabel} numberOfLines={1}>
                            {row.header.label}
                          </Text>
                          <Text style={styles.ssNote} numberOfLines={1}>
                            {row.header.note}
                          </Text>
                        </View>
                      ) : null}
                      {/* One rail down the group, across the gaps between
                          partners, a removed one included (E11). */}
                      {grouped ? (
                        <View
                          style={[
                            styles.ssRail,
                            {
                              top: row.header ? RAIL.underLabel : row.railAbove ? RAIL.fromAbove : 0,
                              bottom: row.railBelow ? RAIL.intoBelow : RAIL.end,
                            },
                          ]}
                        />
                      ) : null}
                      {row.removed ? (
                        <RemovedExerciseRow
                          name={ex.name}
                          label={row.removedLabel ?? ''}
                          tag={row.tag}
                          onUndo={() => restore(ex.id)}
                        />
                      ) : (
                        <View
                          onLayout={(e) => {
                            cardHeights.current.set(ex.id, e.nativeEvent.layout.height);
                          }}
                        >
                          <ExerciseCard
                            exercise={ex}
                            unit={session.unit}
                            menuOpen={openMenuId === ex.id}
                            onToggleMenu={() => setOpenMenuId((id) => (id === ex.id ? null : ex.id))}
                            onReorderStart={() => {
                              setOpenMenuId(null);
                              Keyboard.dismiss();
                              setReordering(true);
                            }}
                            onReplace={() => openLibrary(ex.id)}
                            onSuperset={
                              cards.length < 2
                                ? undefined
                                : () => {
                                    setOpenMenuId(null);
                                    if (ex.supersetGroup != null) edit((s) => leaveSuperset(s, ex.id));
                                    else setSupersetExId(ex.id);
                                  }
                            }
                            inSuperset={ex.supersetGroup != null}
                            supersetTag={row.tag}
                            onRemove={() => collapse(ex.id)}
                            onAddSet={() => {
                              const setId = newId();
                              edit((s) => addSet(s, ex.id, setId));
                            }}
                            onCycleType={(setId) => {
                              haptics.select();
                              edit((s) => cycleSetType(s, ex.id, setId));
                            }}
                            onWeightChange={(setId, t) => edit((s) => editSetWeight(s, ex.id, setId, t))}
                            onRepsChange={(setId, t) => edit((s) => editSetReps(s, ex.id, setId, t))}
                            onDeleteSet={(setId) => {
                              setOpenSetId(null);
                              edit((s) => removeSet(s, ex.id, setId));
                            }}
                            openSetId={openSetId}
                            onSetOpenChange={(setId, open) => setOpenSetId(open ? setId : null)}
                            // Live-only: there is no note field, rest row, PREV or
                            // tick in edit mode, so nothing can reach these.
                            onNoteChange={noop}
                            onOpenRest={noop}
                            onUsePrev={noop}
                            onToggleDone={noop}
                            edit={{
                              setState: (setId) => ({
                                was: wasLabel(session, ex.id, setId),
                                onWasPress: canToggleDone(session, setId)
                                  ? () => {
                                      haptics.select();
                                      edit((s) => toggleSetDone(s, ex.id, setId));
                                    }
                                  : undefined,
                              }),
                              emptyHint: exerciseHint(session, ex.id),
                              onRemoveSet: (setId) => {
                                setOpenSetId(null);
                                edit((s) => removeSet(s, ex.id, setId));
                              },
                              recordLine: recordLine(
                                impact.filter((c) => c.exerciseId === ex.exerciseCatalogId),
                                session.unit,
                              ),
                            }}
                          />
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Editing never deletes a workout: with nothing left to save,
                    Save stays inert and this says why. */}
                {noSets && (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>
                      {cards.length === 0 ? 'No exercises' : 'No sets'}
                    </Text>
                    <Text style={styles.emptyBody}>
                      A workout needs at least one set to save. To remove the whole workout,
                      delete it from History.
                    </Text>
                  </View>
                )}

                <PressableScale
                  style={styles.addExercise}
                  onPress={() => openLibrary(null)}
                  accessibilityRole="button"
                >
                  <PlusIcon size={15} color={color.text1} strokeWidth={2.4} />
                  <Text style={styles.addExerciseText}>Add Exercise</Text>
                </PressableScale>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && kbHeight > 0 ? (
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
      ) : null}

      {/* HEADER (absolute, over a fade of the page background) */}
      <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP }]}>
        <HeaderFade />
        <Pressable
          onPress={onCancel}
          disabled={saving || deciding}
          style={styles.cancel}
          hitSlop={HEADER_SLOP}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || deciding }}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={styles.editing}>EDITING</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {stored?.name ?? ''}
          </Text>
        </View>
        {/* Inert until something changes, then the screen's one accent. */}
        <Pressable
          onPress={() => void onSave()}
          disabled={!savable || saving || deciding}
          style={[styles.save, savable && styles.saveOn]}
          hitSlop={HEADER_SLOP}
          accessibilityRole="button"
          accessibilityState={{ disabled: !savable || saving || deciding }}
        >
          <Text style={[styles.saveText, savable && styles.saveTextOn]}>Save</Text>
        </Pressable>
      </View>

      {session && stored ? (
        <>
          <WhenSheet
            field={whenField}
            when={{ startedAt: session.startedAt, durationSeconds: session.durationSeconds }}
            stored={{
              startedAt: stored.startedAt,
              durationSeconds: stored.durationSeconds,
              endedAt: stored.endedAt,
            }}
            healthLine={health ? healthEditLine(health) : null}
            onDone={(when) => {
              edit((s) => setWhen(s, when));
              setWhenField(null);
            }}
            onClose={() => setWhenField(null)}
          />
          <SaveRecordsSheet
            visible={confirmSave}
            changes={impact}
            unit={session.unit}
            saving={saving}
            onSave={() => void save()}
            onClose={() => setConfirmSave(false)}
          />
          <DiscardSheet
            visible={confirmDiscard}
            changeCount={plan?.changeCount ?? 0}
            onDiscard={() => {
              setConfirmDiscard(false);
              if (!saving) leave();
            }}
            onClose={() => setConfirmDiscard(false)}
          />
          <SupersetSheet
            visible={supersetExId != null}
            anchorExercise={cards.find((e) => e.id === supersetExId) ?? null}
            candidates={cards.filter((e) => e.id !== supersetExId)}
            onConfirm={(ids) => {
              const anchor = supersetExId;
              if (anchor) edit((s) => joinSuperset(s, [anchor, ...ids]));
              setSupersetExId(null);
            }}
            onClose={() => setSupersetExId(null)}
          />
          <ReorderExercises
            visible={reordering}
            exercises={cards}
            topInset={insets.top}
            onDone={() => setReordering(false)}
            onReorder={(next) => edit((s) => reorderExercises(s, next.map((e) => e.id)))}
          />
        </>
      ) : null}
    </View>
  );
}

/** A 34pt header button reaches the 44pt minimum through its slop. */
const HEADER_SLOP = { top: 5, bottom: 5, left: 4, right: 4 };

function WhenCell({
  label,
  value,
  was,
  onPress,
}: {
  label: string;
  value: string;
  was: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.whenCell, pressed && styles.whenCellPressed]}
      accessibilityRole="button"
      accessibilityLabel={`${label.toLowerCase()}, ${value}`}
      accessibilityHint="Opens the date and time picker"
    >
      <View style={styles.whenLabelRow}>
        <Text style={styles.whenLabel}>{label}</Text>
        <ChevronDownIcon size={9} color={color.text3} strokeWidth={2.6} />
      </View>
      {/* Never an ellipsis: "Wed 30 Sep" is 2pt wider than the cell at 390pt,
          and the board lets it run unclipped. It shrinks a touch instead. */}
      <Text
        style={styles.whenValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.9}
        ellipsizeMode="clip"
      >
        {value}
      </Text>
      {was ? (
        <Text style={styles.whenWas} numberOfLines={1}>
          {was}
        </Text>
      ) : null}
    </Pressable>
  );
}

const tabular: ['tabular-nums'] = ['tabular-nums'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16 },
  loading: { paddingVertical: 48, alignItems: 'center' },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: HEADER_BOTTOM,
  },
  cancel: {
    height: HEADER_ROW,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: color.surface2,
    justifyContent: 'center',
  },
  cancelText: { fontFamily: font.titleSemi, fontSize: 13, color: color.text2 },
  headerMid: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 },
  editing: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 1.33,
    color: color.text3,
  },
  headerTitle: {
    maxWidth: '100%',
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    letterSpacing: -0.145,
    color: color.text1,
  },
  save: {
    height: HEADER_ROW,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: color.surface2,
    justifyContent: 'center',
  },
  saveOn: { backgroundColor: color.accent },
  saveText: { fontFamily: font.displayBold, fontSize: 13, color: color.text3 },
  saveTextOn: { color: color.accentFg },

  // Date · start · duration -------------------------------------------
  whenRow: { flexDirection: 'row', gap: 8 },
  whenCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 66,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 5,
  },
  whenCellPressed: { backgroundColor: color.surface2 },
  whenLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whenLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9,
    letterSpacing: 0.9,
    color: color.text3,
  },
  whenValue: {
    fontFamily: font.monoSemi,
    fontSize: 15,
    color: color.text1,
    fontVariant: tabular,
  },
  whenWas: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.text3,
    fontVariant: tabular,
  },

  // Cards --------------------------------------------------------------
  list: { gap: LIST_GAP, marginTop: 14 },
  // Supersets keep their rail and tags (11a), drawn as board 13b's E11 has
  // them: the label over the group, the rail in the page margin.
  ssMember: { position: 'relative' },
  ssHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: SS_HEADER_HEIGHT,
    marginBottom: SS_HEADER_GAP,
    paddingHorizontal: 2,
  },
  ssLabel: {
    flexShrink: 0,
    fontFamily: font.monoSemi,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text2,
  },
  ssNote: {
    flexShrink: 1,
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
  },
  ssRail: {
    position: 'absolute',
    left: -9,
    width: 2,
    borderRadius: 2,
    backgroundColor: color.text3,
  },
  emptyCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyTitle: { fontFamily: font.titleSemi, fontSize: 16, color: color.text1, textAlign: 'center' },
  emptyBody: {
    fontFamily: font.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20.25,
    color: color.text2,
    marginTop: 6,
    textAlign: 'center',
  },
  addExercise: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addExerciseText: { fontFamily: font.titleSemi, fontSize: 14, color: color.text1 },

  // The live workout's Done bar, with nothing on its left.
  kbdAccessory: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: color.surface2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.border,
  },
  // text1, where the live bar is accent: Save is this screen's one accent.
  kbdAccessoryDone: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    color: color.text1,
    paddingHorizontal: 6,
  },
});
