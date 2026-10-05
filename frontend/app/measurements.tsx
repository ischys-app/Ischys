/**
 * Body measurements (#65) — the list, and the sheet that logs a sitting.
 *
 * One accent on this screen: Log. Everything else is a reading you already
 * took, and a reading is not an action.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DraggableSheet } from '../src/components/DraggableSheet';
import { PressableScale } from '../src/components/PressableScale';
import { BackChevronIcon, ChevronRightIcon } from '../src/components/icons';
import {
  METRICS,
  deltaBetween,
  formatMeasurement,
  toCanonical,
  unitFor,
  type MetricId,
} from '../src/domain/measurements';
import {
  addMeasurements,
  latestMeasurements,
  measurementHistory,
  type MeasurementRow,
} from '../src/data/measurementsRepo';
import { getSettings } from '../src/api/workouts';
import { syncBodyMeasurementsFromHealth } from '../src/lib/healthSync';
import { color, font } from '../src/theme/tokens';

/** Sentence-case labels; the ids are camelCase and not for reading. */
const LABEL: Record<MetricId, string> = {
  waist: 'Waist',
  chest: 'Chest',
  arms: 'Arms',
  thighs: 'Thighs',
  calves: 'Calves',
  shoulders: 'Shoulders',
  hips: 'Hips',
  neck: 'Neck',
  bodyweight: 'Bodyweight',
  bodyFat: 'Body fat',
};

export default function MeasurementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [latest, setLatest] = useState<Map<MetricId, MeasurementRow>>(new Map());
  const [previous, setPrevious] = useState<Map<MetricId, MeasurementRow>>(new Map());
  const [prefs, setPrefs] = useState<{ weightUnit: 'kg' | 'lb' }>({ weightUnit: 'kg' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<MetricId, string>>>({});

  const load = useCallback(async () => {
    // Pull anything new from Health first, so the list shows it on arrival
    // rather than on the next visit. No-op when Health isn't connected.
    await syncBodyMeasurementsFromHealth();
    const [rows, settings] = await Promise.all([
      latestMeasurements(),
      getSettings().catch(() => null),
    ]);
    setLatest(rows);
    if (settings?.unit === 'lb' || settings?.unit === 'kg') setPrefs({ weightUnit: settings.unit });

    // The reading before the newest, so each row can show what changed. Only
    // for metrics that actually have a latest — the rest have no delta to show.
    const prev = new Map<MetricId, MeasurementRow>();
    await Promise.all(
      [...rows.keys()].map(async (metric) => {
        const history = await measurementHistory(metric);
        if (history.length >= 2) prev.set(metric, history[history.length - 2]);
      }),
    );
    setPrevious(prev);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    // Blanks are skipped, not zeroed: an untouched field means "didn't measure
    // that today", which is different from measuring zero.
    const entries = METRICS.flatMap((metric) => {
      const raw = draft[metric];
      if (!raw || !raw.trim()) return [];
      const value = toCanonical(raw, metric, prefs);
      return value === null ? [] : [{ metric, value }];
    });
    if (entries.length > 0) {
      try {
        await addMeasurements(entries);
      } catch {
        // None of the readings were stored. The sheet stays open with what
        // was typed, so Save can be tapped again.
        Alert.alert('Couldn’t save', 'Nothing was changed. Try again.');
        return;
      }
    }
    setDraft({});
    setSheetOpen(false);
    Keyboard.dismiss();
    await load();
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button">
          <BackChevronIcon color={color.text1} />
        </Pressable>
        <Text style={styles.title}>Measurements</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={styles.card}>
          {METRICS.map((metric, i) => {
            const row = latest.get(metric);
            const prev = previous.get(metric);
            return (
              <Pressable
                key={metric}
                style={[styles.row, i === 0 && styles.rowFirst]}
                onPress={() => router.push(`/measurement/${metric}`)}
                accessibilityRole="button"
              >
                <Text style={styles.rowLabel}>{LABEL[metric]}</Text>
                <View style={styles.rowRight}>
                  {row ? (
                    <>
                      <Text style={styles.rowValue}>{formatMeasurement(row.value, metric, prefs)}</Text>
                      {prev ? (
                        // Signed and neutral. A measurement moving is not good
                        // or bad on its own, and colouring it would decide that
                        // for the user.
                        <Text style={styles.rowDelta}>
                          {deltaBetween(prev.value, row.value, metric, prefs)}
                        </Text>
                      ) : null}
                    </>
                  ) : (
                    <Text style={styles.rowEmpty}>Not logged</Text>
                  )}
                  <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.2} />
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.ctaWrap, { bottom: 24 + insets.bottom }]}>
        <PressableScale style={styles.cta} onPress={() => setSheetOpen(true)} accessibilityRole="button">
          <Text style={styles.ctaText}>Log</Text>
        </PressableScale>
      </View>

      <DraggableSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} sheetStyle={styles.sheet}>
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Log measurements</Text>
          <Pressable onPress={() => setSheetOpen(false)} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        <Text style={styles.sheetNote}>Fill in what you measured. Blanks are skipped.</Text>

        <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
          {METRICS.map((metric) => (
            <View key={metric} style={styles.entryRow}>
              <Text style={styles.entryLabel}>{LABEL[metric]}</Text>
              <View style={styles.entryBox}>
                <TextInput
                  value={draft[metric] ?? ''}
                  onChangeText={(t) => setDraft((d) => ({ ...d, [metric]: t }))}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder="—"
                  placeholderTextColor={color.text3}
                  style={styles.entryInput}
                />
                <Text style={styles.entryUnit}>{unitFor(metric, prefs)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <PressableScale style={styles.cta} onPress={() => void save()} accessibilityRole="button">
          <Text style={styles.ctaText}>Save</Text>
        </PressableScale>
      </DraggableSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
  content: { paddingHorizontal: 16 },

  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 54,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hair,
  },
  rowFirst: { borderTopWidth: 0 },
  rowLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowValue: { fontFamily: font.monoMedium, fontSize: 15, color: color.text1 },
  rowDelta: { fontFamily: font.monoRegular, fontSize: 12, color: color.text2 },
  rowEmpty: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3 },

  ctaWrap: { position: 'absolute', left: 16, right: 16 },
  cta: {
    height: 52,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: font.titleSemi, fontSize: 16, color: color.accentFg },

  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  grabberWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 6 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.surface3 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
  cancel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text2 },
  sheetNote: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, marginTop: 2 },
  sheetList: { maxHeight: 340, marginTop: 12, marginBottom: 12 },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  entryLabel: { fontFamily: font.bodyRegular, fontSize: 15, color: color.text1 },
  entryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 128,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
  },
  entryInput: { flex: 1, fontFamily: font.monoMedium, fontSize: 16, color: color.text1, padding: 0 },
  entryUnit: { fontFamily: font.monoRegular, fontSize: 12, color: color.text3 },
});
