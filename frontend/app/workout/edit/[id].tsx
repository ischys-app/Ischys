/**
 * Edit a completed workout (#83).
 *
 * Source of truth: design-handoff board 13a, frames E2–E8.
 *
 * A thin view over domain/workoutEdit.ts. Nothing is written until Save, and
 * Save is one transaction (data/workoutEditRepo.ts). The cards and set rows are
 * the live workout's own, in their edit mode; what makes this read as history
 * is what is missing — no clock, no HR strip, no rest timer, no ticks.
 *
 * This screen starts nothing: no Live Activity, no Watch session, no rest
 * notification, no HealthKit session. It imports none of them.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
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
import { ReorderExercises } from '../../../src/components/workout/ReorderExercises';
import { SupersetSheet } from '../../../src/components/workout/SupersetSheet';
import { newId } from '../../../src/data/ids';
import {
  loadExerciseHistory,
  loadWorkoutForEdit,
  saveWorkoutEdit,
} from '../../../src/data/workoutEditRepo';
import { groupLabels } from '../../../src/domain/supersets';
import {
  activeExercises,
  addExercise,
  addSet,
  buildPlan,
  canToggleDone,
  cycleSetType,
  editSetReps,
  editSetWeight,
  exerciseHint,
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
  removedExercises,
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

export default function EditWorkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;
  const from = Array.isArray(params.from) ? params.from[0] : params.from;

  const [session, setSession] = useState<EditSession | null>(null);
  const [records, setRecords] = useState<RecordContext | null>(null);
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
  const cards = useMemo(() => (session ? activeExercises(session) : []), [session]);
  const removed = useMemo(() => (session ? removedExercises(session) : []), [session]);
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
    try {
      await saveWorkoutEdit(buildPlan(current));
    } catch {
      saveStarted.current = false;
      setSaving(false);
      setConfirmSave(false);
      haptics.error();
      Alert.alert('Couldn’t save', 'Nothing was changed. Try again.');
      return;
    }
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

  // --- supersets --------------------------------------------------------------

  const ssLabels = useMemo(
    () =>
      groupLabels(
        cards.map((e) => ({ id: e.id, supersetGroup: e.supersetGroup, rest: e.rest, sets: [] })),
      ),
    [cards],
  );
  const partnersOf = (exId: string) => {
    const me = cards.find((e) => e.id === exId);
    if (!me || me.supersetGroup == null) return [];
    return cards.filter((e) => e.supersetGroup === me.supersetGroup);
  };
  /** "A1" / "A2" — letter of the group, index within it. */
  const supersetTagFor = (exId: string): string | null => {
    const partners = partnersOf(exId);
    const letter = partners.length ? ssLabels.get(partners[0].supersetGroup as number) : null;
    return letter ? `${letter}${partners.findIndex((e) => e.id === exId) + 1}` : null;
  };
  /** One header per group. Rounds are a count here: every one of them is done. */
  const supersetHeaderFor = (exId: string): string | null => {
    const partners = partnersOf(exId);
    if (partners.length < 2 || partners[0].id !== exId) return null;
    const letter = ssLabels.get(partners[0].supersetGroup as number);
    const rounds = Math.max(...partners.map((p) => p.sets.filter((x) => x.type === 'normal').length));
    return `SUPERSET ${letter} · ${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}`;
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: headerHeight + CONTENT_GAP,
              paddingBottom: 40 + insets.bottom,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
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
                {cards.map((ex) => (
                  <View key={ex.id} style={ex.supersetGroup != null ? styles.ssMember : undefined}>
                    {supersetHeaderFor(ex.id) ? (
                      <Text style={styles.ssHeader}>{supersetHeaderFor(ex.id)}</Text>
                    ) : null}
                    {ex.supersetGroup != null ? <View style={styles.ssRail} /> : null}
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
                      supersetTag={supersetTagFor(ex.id)}
                      onRemove={() => {
                        setOpenMenuId(null);
                        edit((s) => removeExercise(s, ex.id));
                      }}
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
                ))}

                {removed.map((ex) => (
                  <View key={ex.id} style={styles.removedRow}>
                    <Text style={styles.removedName} numberOfLines={1}>
                      {ex.name}
                      <Text style={styles.removedTag}>{' · REMOVED'}</Text>
                    </Text>
                    <Pressable
                      onPress={() => edit((s) => undoRemoveExercise(s, ex.id))}
                      style={styles.undo}
                      accessibilityRole="button"
                      accessibilityLabel={`Undo removing ${ex.name}`}
                    >
                      <Text style={styles.undoText}>Undo</Text>
                    </Pressable>
                  </View>
                ))}

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
  list: { gap: 10, marginTop: 14 },
  // Supersets keep their rail and tags, as on the live workout (11a).
  ssMember: { position: 'relative' },
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
  removedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
  },
  removedName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: color.text3,
  },
  removedTag: { fontFamily: font.monoRegular, fontSize: 11 },
  undo: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  undoText: { fontFamily: font.titleSemi, fontSize: 13.5, color: color.text1 },
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
