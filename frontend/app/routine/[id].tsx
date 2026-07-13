/**
 * Routine Builder — build/edit a saved routine of exercises + target sets.
 * Source-of-truth: export/ischys-app/Routine Builder.dc.html.
 *
 * Route param `id`:
 *   - 'new' → create flow, starts blank
 *   - otherwise → edit flow, loads the routine by id
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createRoutine,
  getRoutine,
  updateRoutine,
} from '../../src/api/routines';
import type {
  ExerciseOut,
  RoutineExerciseIn,
  SetType,
} from '../../src/api/types';
import {
  ChevronRightIcon,
  ClockRowIcon,
  DumbbellIcon,
  SyncIcon,
  TrashIcon,
} from '../../src/components/icons';
import { RestPickerSheet } from '../../src/components/workout/RestPickerSheet';
import {
  restLabel,
  TYPE_CYCLE,
  typeMeta,
} from '../../src/components/workout/types';
import { takePendingSelection } from '../../src/lib/pendingSelection';
import { color, font } from '../../src/theme/tokens';

const DEFAULT_REST_SECONDS = 120;

type RSet = {
  id: string;
  type: SetType;
  targetWeight: string;
  targetReps: string;
};

type REx = {
  id: string;
  exercise: ExerciseOut;
  restSeconds: number;
  note: string;
  sets: RSet[];
};

const TYPE_LABEL: Record<SetType, string> = {
  normal: 'Working',
  warmup: 'Warmup',
  drop: 'Drop set',
  failure: 'To failure',
};

/** "KG" for weighted exercises, "+KG" for bodyweight (added weight). */
function weightColumnLabelFor(kind: ExerciseOut['kind']): string {
  return kind === 'bodyweight' ? '+KG' : 'KG';
}

let _seq = 0;
const uid = (p: string) => `${p}-${++_seq}-${Date.now().toString(36)}`;

/** Server number → input string ('' for null). */
function numStr(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

export default function RoutineBuilder() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const routeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isNew = routeId === 'new';

  const [name, setName] = useState('');
  const [exercises, setExercises] = useState<REx[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [restSheetExId, setRestSheetExId] = useState<string | null>(null);

  // Load existing routine (edit mode).
  useEffect(() => {
    if (isNew || !routeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await getRoutine(routeId);
        if (cancelled) return;
        setName(r.name);
        setExercises(
          r.exercises.map((rex) => ({
            id: uid('rex'),
            exercise: rex.exercise,
            restSeconds: rex.rest_seconds,
            note: rex.note ?? '',
            sets: rex.sets.map((s) => ({
              id: uid('rset'),
              type: s.type,
              targetWeight: numStr(s.target_weight),
              targetReps: numStr(s.target_reps),
            })),
          })),
        );
      } catch {
        // best-effort — leave empty and let the user rebuild
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, routeId]);

  /** Set while the library is picking a replacement, so the drain swaps instead of appends. */
  const replaceTarget = useRef<string | null>(null);

  // Drain any pending selection from the Exercise Library when we regain focus.
  const initialFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      const target = replaceTarget.current;
      replaceTarget.current = null;

      const picked = takePendingSelection();
      if (!picked || picked.length === 0) return;

      if (target) {
        // Keep the planned set structure — 3×normal stays 3×normal — but drop
        // the targets, which were the old exercise's numbers. Rest carries over.
        const chosen = picked[0];
        setExercises((prev) =>
          prev.map((e) =>
            e.id === target
              ? {
                  ...e,
                  exercise: chosen,
                  note: '',
                  sets: e.sets.map((s) => ({ ...s, targetWeight: '', targetReps: '' })),
                }
              : e,
          ),
        );
        return;
      }

      setExercises((prev) => [
        ...prev,
        ...picked.map<REx>((ex) => ({
          id: uid('rex'),
          exercise: ex,
          restSeconds: DEFAULT_REST_SECONDS,
          note: '',
          sets: [{ id: uid('rset'), type: 'normal', targetWeight: '', targetReps: '' }],
        })),
      ]);
    }, []),
  );

  const totalSets = useMemo(
    () => exercises.reduce((n, ex) => n + ex.sets.length, 0),
    [exercises],
  );

  // --- exercise mutations ---
  const removeExercise = (rexId: string) =>
    setExercises((prev) => prev.filter((e) => e.id !== rexId));

  const setNote = (rexId: string, note: string) =>
    setExercises((prev) =>
      prev.map((e) => (e.id === rexId ? { ...e, note } : e)),
    );

  const setRest = (rexId: string, seconds: number) =>
    setExercises((prev) =>
      prev.map((e) => (e.id === rexId ? { ...e, restSeconds: seconds } : e)),
    );

  const addSet = (rexId: string) =>
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== rexId
          ? e
          : {
              ...e,
              sets: [
                ...e.sets,
                { id: uid('rset'), type: 'normal', targetWeight: '', targetReps: '' },
              ],
            },
      ),
    );

  const patchSet = (rexId: string, setId: string, patch: Partial<RSet>) =>
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== rexId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            },
      ),
    );

  const cycleType = (rexId: string, setId: string) => {
    const ex = exercises.find((e) => e.id === rexId);
    const s = ex?.sets.find((x) => x.id === setId);
    if (!s) return;
    const next = TYPE_CYCLE[(TYPE_CYCLE.indexOf(s.type) + 1) % TYPE_CYCLE.length];
    patchSet(rexId, setId, { type: next });
  };

  // Map local state → RoutineExerciseIn[] for save.
  const buildPayload = (): RoutineExerciseIn[] =>
    exercises.map((rex) => ({
      exercise_id: rex.exercise.id,
      rest_seconds: rex.restSeconds,
      note: rex.note || undefined,
      sets: rex.sets.map((s) => ({
        type: s.type,
        target_weight: s.targetWeight === '' ? null : parseFloat(s.targetWeight),
        target_reps: s.targetReps === '' ? null : parseInt(s.targetReps, 10),
      })),
    }));

  const canSave = name.trim() !== '';

  const onSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isNew) {
        await createRoutine({ name: name.trim(), exercises: payload });
      } else if (routeId) {
        await updateRoutine(routeId, { name: name.trim(), exercises: payload });
      }
      router.back();
    } catch {
      // Best-effort. Leave the user on the screen so they don't lose work.
      setSaving(false);
    }
  };

  const openLibrary = () => router.push('/exercise-library?pick=1');

  const openReplace = (rexId: string) => {
    replaceTarget.current = rexId;
    router.push('/exercise-library?pick=1');
  };

  const restSheetExercise = exercises.find((e) => e.id === restSheetExId) ?? null;
  const titleText = isNew ? 'New Routine' : name || 'Edit Routine';

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{
            paddingTop: 100 + insets.top,
            paddingHorizontal: 16,
            paddingBottom: 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Routine name"
            placeholderTextColor={color.text3}
            style={styles.titleInput}
            multiline
          />

          <View style={styles.metaRow}>
            <Text style={styles.metaText}>{exercises.length} exercises</Text>
            <Text style={styles.metaText}> · </Text>
            <Text style={styles.metaText}>{totalSets} sets</Text>
          </View>

          {!loading && exercises.length === 0 && <EmptyBuilder />}

          {exercises.length > 0 && (
            <View style={styles.exList}>
              {exercises.map((rex) => (
                <ExerciseCardBuilder
                  onReplace={() => openReplace(rex.id)}
                  key={rex.id}
                  rex={rex}
                  onRemove={() => removeExercise(rex.id)}
                  onNoteChange={(t) => setNote(rex.id, t)}
                  onOpenRest={() => setRestSheetExId(rex.id)}
                  onAddSet={() => addSet(rex.id)}
                  onCycleType={(setId) => cycleType(rex.id, setId)}
                  onWeightChange={(setId, t) =>
                    patchSet(rex.id, setId, { targetWeight: t })
                  }
                  onRepsChange={(setId, t) =>
                    patchSet(rex.id, setId, { targetReps: t })
                  }
                />
              ))}
            </View>
          )}

          <Pressable
            onPress={openLibrary}
            style={({ pressed }) => [
              styles.addExercise,
              pressed && { borderColor: color.text3 },
            ]}
          >
            <Text style={styles.addExercisePlus}>+</Text>
            <Text style={styles.addExerciseText}>Add Exercise</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Absolute header */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {titleText}
        </Text>
        <Pressable
          onPress={onSave}
          disabled={!canSave || saving}
          hitSlop={8}
          pointerEvents={!canSave ? 'none' : 'auto'}
          style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.5 }]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>

      <RestPickerSheet
        visible={restSheetExId != null}
        selectedSeconds={restSheetExercise?.restSeconds ?? -1}
        onSelect={(seconds) => {
          if (restSheetExId) setRest(restSheetExId, seconds);
          setRestSheetExId(null);
        }}
        onClose={() => setRestSheetExId(null)}
      />
    </View>
  );
}

function EmptyBuilder() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <DumbbellIcon size={26} color={color.accent} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>Build your routine</Text>
      <Text style={styles.emptySub}>
        Add exercises and set target reps and weights. Pull them up instantly every session.
      </Text>
    </View>
  );
}

function ExerciseCardBuilder({
  rex,
  onReplace,
  onRemove,
  onNoteChange,
  onOpenRest,
  onAddSet,
  onCycleType,
  onWeightChange,
  onRepsChange,
}: {
  rex: REx;
  onReplace: () => void;
  onRemove: () => void;
  onNoteChange: (t: string) => void;
  onOpenRest: () => void;
  onAddSet: () => void;
  onCycleType: (setId: string) => void;
  onWeightChange: (setId: string, t: string) => void;
  onRepsChange: (setId: string, t: string) => void;
}) {
  const ex = rex.exercise;
  const muscleLine = ex.category?.name ?? ex.primary_muscle?.name ?? ex.equipment;
  const wLabel = weightColumnLabelFor(ex.kind);

  // Working-set index counter — resets per exercise.
  let workingIdx = 0;

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{ex.initials}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.exName} numberOfLines={1}>
            {ex.name}
          </Text>
          <Text style={styles.exMuscle} numberOfLines={1}>
            {muscleLine}
          </Text>
        </View>
        <Pressable
          onPress={onReplace}
          hitSlop={8}
          style={styles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel={`Replace ${ex.name}`}
        >
          <SyncIcon size={16} color={color.text3} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          style={styles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${ex.name}`}
        >
          <TrashIcon size={16} color={color.text3} strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Note — warmup-tinted when populated (design source) */}
      <TextInput
        value={rex.note}
        onChangeText={onNoteChange}
        placeholder="Add notes here…"
        placeholderTextColor={color.text3}
        multiline
        style={[styles.noteInput, rex.note.length > 0 && styles.noteInputFilled]}
      />

      {/* Rest timer row */}
      <Pressable onPress={onOpenRest} style={styles.restRow}>
        <ClockRowIcon size={15} color={color.accent} strokeWidth={2.4} />
        <Text style={styles.restLabel}>Rest Timer</Text>
        <View style={styles.restValueWrap}>
          <Text style={styles.restValue}>{restLabel(rex.restSeconds)}</Text>
          <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.4} />
        </View>
      </Pressable>

      {/* Column labels */}
      <View style={styles.colLabels}>
        <Text style={[styles.colLabelText, styles.colSet]}>SET</Text>
        <Text style={[styles.colLabelText, styles.colType]}>TYPE</Text>
        <Text style={[styles.colLabelText, styles.colWeight]}>{wLabel}</Text>
        <Text style={[styles.colLabelText, styles.colReps]}>REPS</Text>
      </View>

      {/* Set rows */}
      <View style={styles.setsList}>
        {rex.sets.map((s) => {
          let badge: string;
          if (s.type === 'normal') {
            workingIdx += 1;
            badge = String(workingIdx);
          } else if (s.type === 'warmup') badge = 'W';
          else if (s.type === 'drop') badge = 'D';
          else badge = 'F';

          const meta = typeMeta[s.type];
          return (
            <View key={s.id} style={styles.setRow}>
              <View style={styles.colSet}>
                <Pressable
                  onPress={() => onCycleType(s.id)}
                  hitSlop={8}
                  style={[
                    styles.badge,
                    { backgroundColor: meta.tintBg },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: meta.color }]}>{badge}</Text>
                </Pressable>
              </View>
              <View style={styles.colType}>
                <Text style={styles.typeLabelText}>{TYPE_LABEL[s.type]}</Text>
              </View>
              <View style={styles.colWeight}>
                <TextInput
                  value={s.targetWeight}
                  onChangeText={(t) => onWeightChange(s.id, t)}
                  placeholder="—"
                  placeholderTextColor={color.text3}
                  keyboardType="decimal-pad"
                  style={styles.numInput}
                />
              </View>
              <View style={styles.colReps}>
                <TextInput
                  value={s.targetReps}
                  onChangeText={(t) => onRepsChange(s.id, t)}
                  placeholder="—"
                  placeholderTextColor={color.text3}
                  keyboardType="number-pad"
                  style={styles.numInput}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* + Add Set */}
      <Pressable
        onPress={onAddSet}
        style={({ pressed }) => [
          styles.addSet,
          pressed && { borderColor: color.accent },
        ]}
      >
        <Text style={styles.addSetText}>+ Add Set</Text>
      </Pressable>
    </View>
  );
}

const COL_SET = 40;
const COL_WEIGHT = 74;
const COL_REPS = 64;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(10,10,11,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cancel: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.text2,
  },
  headerTitle: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    letterSpacing: -0.16,
    color: color.text1,
    maxWidth: 200,
    textAlign: 'center',
  },
  saveBtn: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.accentFg,
  },

  // Title + meta ------------------------------------------------------
  titleInput: {
    width: '100%',
    backgroundColor: 'transparent',
    color: color.text1,
    fontFamily: font.displayBold,
    fontSize: 26,
    letterSpacing: -0.52,
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginHorizontal: 2,
    marginBottom: 22,
  },
  metaText: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },

  // Empty state ------------------------------------------------------
  empty: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: 30,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    borderRadius: 16,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 15,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: font.titleSemi,
    fontSize: 17,
    letterSpacing: -0.17,
    color: color.text1,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: font.bodyRegular,
    fontSize: 13.5,
    color: color.text2,
    lineHeight: 20,
    maxWidth: 250,
    marginTop: 6,
    textAlign: 'center',
  },

  // Exercise cards ---------------------------------------------------
  exList: { flexDirection: 'column', gap: 12 },
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 2,
    marginBottom: 12,
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
    fontSize: 13,
    color: color.accent,
  },
  headerText: { flex: 1, minWidth: 0 },
  exName: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accent,
  },
  exMuscle: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 1,
  },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Note
  noteInput: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 10,
    color: color.warning,
    fontFamily: font.bodyRegular,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  noteInputFilled: {
    backgroundColor: 'rgba(255,194,75,0.07)',
    borderColor: 'rgba(255,194,75,0.22)',
  },

  // Rest row
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
  },
  restLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: color.text2,
  },
  restValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  restValue: {
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },

  // Column labels
  colLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  colLabelText: {
    fontFamily: font.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.76,
    color: color.text3,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  colSet: { width: COL_SET, alignItems: 'center' },
  colType: { flex: 1, alignItems: 'flex-start' },
  colWeight: { width: COL_WEIGHT, alignItems: 'center' },
  colReps: { width: COL_REPS, alignItems: 'center' },

  // Set rows
  setsList: { flexDirection: 'column', gap: 2 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    height: 46,
    borderRadius: 9,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.hair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: font.monoSemi,
    fontSize: 12.5,
  },
  typeLabelText: {
    fontFamily: font.monoRegular,
    fontSize: 12.5,
    color: color.text3,
  },
  numInput: {
    width: '100%',
    height: 36,
    textAlign: 'center',
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 8,
    color: color.text1,
    fontFamily: font.monoMedium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },

  // + Add Set
  addSet: {
    marginTop: 8,
    width: '100%',
    height: 36,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetText: {
    fontFamily: font.titleSemi,
    fontSize: 12.5,
    color: color.text2,
  },

  // + Add Exercise
  addExercise: {
    marginTop: 12,
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
  addExercisePlus: {
    fontFamily: font.titleSemi,
    fontSize: 20,
    lineHeight: 20,
    color: color.accent,
  },
  addExerciseText: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.text1,
  },
});
