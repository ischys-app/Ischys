/**
 * New Exercise — form for creating a custom catalog exercise.
 * Pushed by the "New" button in the Exercise Library modal.
 * Source of truth: export/ischys-app/New Exercise.dc.html.
 *
 * On save, POSTs to /exercises then pops back to the library. The library
 * re-fetches its exercise list on focus via useFocusEffect, so the new item
 * appears without any explicit hand-off.
 */
import { Stack, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CategoryOut, ExerciseKind, MuscleOut } from '../../src/api/types';
import {
  createExercise,
  listCategories,
  listMuscles,
  type ExerciseEquipment,
} from '../../src/api/workouts';
import { ChevronRightIcon } from '../../src/components/icons';
import { MusclePickerSheet } from '../../src/components/MusclePickerSheet';
import { color, font } from '../../src/theme/tokens';

const EQUIPMENT_OPTIONS: { label: string; value: ExerciseEquipment }[] = [
  { label: 'Barbell', value: 'barbell' },
  { label: 'Dumbbell', value: 'dumbbell' },
  { label: 'Machine', value: 'machine' },
  { label: 'Cable', value: 'cable' },
  { label: 'Bodyweight', value: 'bodyweight' },
  { label: 'Kettlebell', value: 'kettlebell' },
  { label: 'Band', value: 'band' },
  { label: 'Other', value: 'other' },
];

const KIND_OPTIONS: { label: string; value: ExerciseKind }[] = [
  { label: 'Weighted', value: 'weighted' },
  { label: 'Bodyweight', value: 'bodyweight' },
];

export default function NewExercise() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<ExerciseEquipment | null>(null);
  const [kind, setKind] = useState<ExerciseKind>('weighted');
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);
  const [howto, setHowto] = useState('');
  const [howtoFocused, setHowtoFocused] = useState(false);

  const [sheet, setSheet] = useState<'primary' | 'secondary' | null>(null);

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [muscles, setMuscles] = useState<MuscleOut[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch categories + muscles in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, ms] = await Promise.all([
          listCategories().catch(() => [] as CategoryOut[]),
          listMuscles().catch(() => [] as MuscleOut[]),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setMuscles(ms);
      } catch {
        // Non-fatal — user can still type a name and save.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryMuscle = useMemo(
    () => muscles.find((m) => m.id === primaryId) ?? null,
    [muscles, primaryId],
  );

  const canSave = name.trim().length > 0 && !saving;

  const onToggleSecondary = (id: string) => {
    setSecondaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const steps = howto
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      await createExercise({
        name: name.trim(),
        kind,
        equipment: equipment ?? 'other',
        category_id: categoryId,
        primary_muscle_id: primaryId,
        secondary_muscle_ids: secondaryIds,
        how_to_steps: steps.length > 0 ? steps : null,
      });
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create exercise';
      setError(msg);
      if (Platform.OS !== 'web') Alert.alert('Could not save', msg);
      setSaving(false);
    }
  };

  const secondaryText =
    secondaryIds.length === 0
      ? 'None'
      : `${secondaryIds.length} selected`;

  const headerBottom = 100; // reserved space for the absolute header

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: color.bg },
        }}
      />

      {/* Form body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: headerBottom + insets.top,
          paddingHorizontal: 16,
          paddingBottom: 40 + insets.bottom,
          gap: 26,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* NAME */}
        <View>
          <Text style={styles.label}>NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            placeholder="e.g. Incline Bench Press"
            placeholderTextColor={color.text3}
            autoCorrect={false}
            style={[
              styles.nameInput,
              nameFocused && { borderColor: color.accent },
            ]}
          />
        </View>

        {/* CATEGORY */}
        <View>
          <Text style={styles.label}>CATEGORY</Text>
          {categories.length === 0 ? (
            <Text style={styles.hint}>Loading…</Text>
          ) : (
            <View style={styles.chipsRow}>
              {categories.map((c) => {
                const active = categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategoryId(active ? null : c.id)}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        active ? styles.chipTextActive : styles.chipTextInactive,
                      ]}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* MUSCLES (primary + secondary in one card) */}
        <View>
          <View style={styles.musclesCard}>
            <Pressable
              style={styles.muscleRow}
              onPress={() => setSheet('primary')}
              accessibilityRole="button"
            >
              <Text style={styles.linkLabel}>Primary muscle</Text>
              <Text
                style={styles.linkValue}
                numberOfLines={1}
              >
                {primaryMuscle ? primaryMuscle.name : 'None'}
              </Text>
              <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.muscleDivider} />
            <Pressable
              style={styles.muscleRow}
              onPress={() => setSheet('secondary')}
              accessibilityRole="button"
            >
              <Text style={styles.linkLabel}>Secondary muscles</Text>
              <Text
                style={styles.linkValue}
                numberOfLines={1}
              >
                {secondaryText}
              </Text>
              <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.2} />
            </Pressable>
          </View>
        </View>

        {/* EQUIPMENT */}
        <View>
          <Text style={styles.label}>EQUIPMENT</Text>
          <View style={styles.chipsRow}>
            {EQUIPMENT_OPTIONS.map((opt) => {
              const active = equipment === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setEquipment(active ? null : opt.value)}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active ? styles.chipTextActive : styles.chipTextInactive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* KIND */}
        <View>
          <Text style={styles.label}>KIND</Text>
          <View style={styles.segment}>
            {KIND_OPTIONS.map((opt) => {
              const active = kind === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setKind(opt.value)}
                  style={[
                    styles.segmentOption,
                    active && styles.segmentOptionActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? color.text1 : color.text3 },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* HOW TO */}
        <View>
          <Text style={styles.label}>HOW TO</Text>
          <TextInput
            value={howto}
            onChangeText={setHowto}
            onFocus={() => setHowtoFocused(true)}
            onBlur={() => setHowtoFocused(false)}
            multiline
            textAlignVertical="top"
            placeholder={'One instruction per line'}
            placeholderTextColor={color.text3}
            style={[
              styles.howto,
              howtoFocused && { borderColor: color.accent },
            ]}
          />
        </View>

        {error ? <Text style={styles.errorLine}>{error}</Text> : null}
      </ScrollView>

      {/* HEADER (absolute) */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>New Exercise</Text>
        <Pressable
          onPress={onSave}
          disabled={!canSave}
          hitSlop={8}
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        >
          {saving ? (
            <ActivityIndicator color={color.accentFg} size="small" />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </Pressable>
      </View>

      {/* Muscle picker sheet */}
      <MusclePickerSheet
        visible={sheet !== null}
        mode={sheet === 'secondary' ? 'secondary' : 'primary'}
        selectedPrimaryId={primaryId}
        selectedSecondaryIds={secondaryIds}
        onSelectPrimary={(id) => setPrimaryId(id)}
        onToggleSecondary={onToggleSecondary}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.text2,
  },
  title: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    letterSpacing: -0.16,
    color: color.text1,
  },
  saveBtn: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.accentFg,
  },

  // Form --------------------------------------------------------------
  label: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 1.0,
    color: color.text3,
    marginBottom: 9,
    textTransform: 'uppercase',
  },
  hint: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    color: color.text3,
  },

  nameInput: {
    height: 54,
    paddingHorizontal: 14,
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 12,
    color: color.text1,
    fontFamily: font.monoMedium,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(255,74,28,0.12)',
    borderColor: color.accent,
  },
  chipInactive: {
    backgroundColor: color.surface1,
    borderColor: color.border,
  },
  chipText: {
    fontFamily: font.titleSemi,
    fontSize: 13.5,
    fontWeight: '600',
  },
  chipTextActive: { color: color.accent },
  chipTextInactive: { color: color.text2 },

  // Muscles card (single surface-1 card wrapping the two rows)
  musclesCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 56,
    paddingHorizontal: 14,
  },
  muscleDivider: {
    height: 1,
    backgroundColor: color.hair,
  },
  linkLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },
  linkValue: {
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.text3,
    maxWidth: 160,
    fontVariant: ['tabular-nums'],
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: color.surface2,
    borderRadius: 11,
    padding: 4,
    gap: 4,
  },
  segmentOption: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOptionActive: {
    backgroundColor: color.surface3,
  },
  segmentText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    fontWeight: '600',
  },

  howto: {
    minHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 12,
    color: color.text1,
    fontFamily: font.bodyRegular,
    fontSize: 14,
    lineHeight: 22,
  },

  errorLine: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.error,
  },
});
