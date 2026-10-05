/**
 * Warm-up ramp sheet (#68) — proposes a ladder up to the first working set and
 * inserts it in one tap.
 *
 * The rows it inserts are ordinary warm-up sets from then on: swipe to delete,
 * tap the badge to change type. Warm-ups are already excluded from PRs and
 * volume, so nothing downstream needs to know these came from here.
 *
 * The ladder is computed and inserted in kilograms, like every stored weight.
 * What changes with the unit is the rounding (see `domain/loadRounding`) and
 * the labels: a pound lifter ramps through 135 and 185, not 61.2 and 83.9.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DraggableSheet } from '../DraggableSheet';
import { PressableScale } from '../PressableScale';
import { color, font } from '../../theme/tokens';
import { warmupRounder } from '../../domain/loadRounding';
import { defaultWarmupSets, warmupRamp, type RampRow } from '../../domain/warmupRamp';
import { loadToKg, solvePlatesForKg, type BarSetup } from '../../domain/plateMath';
import { unitLabel, weightText, type Unit } from '../../domain/units';

type Props = {
  visible: boolean;
  /** Name of the exercise being warmed up, for the subtitle. */
  exerciseName: string;
  /** Weight (kg) and reps of the first working set. */
  workingKg: number;
  workingReps: number;
  /** The unit the workout is being typed in: labels and non-barbell rounding. */
  unit: Unit;
  /** 'barbell' | 'dumbbell' | 'machine' | … — decides rounding and the bar rung. */
  equipment: string;
  setup: BarSetup;
  /** Rows carry kilograms; a pound row is the kg that reads as that pound number. */
  onInsert: (rows: RampRow[]) => void;
  onClose: () => void;
};

const SET_CHOICES = [1, 2, 3, 4, 5];
const fmt = (n: number): string => String(Math.round(n * 100) / 100);

export function WarmupSheet({
  visible,
  exerciseName,
  workingKg,
  workingReps,
  unit,
  equipment,
  setup,
  onInsert,
  onClose,
}: Props) {
  const [sets, setSets] = useState<number | null>(null);
  const chosen = sets ?? defaultWarmupSets(workingKg);

  const rows = useMemo(
    () =>
      warmupRamp({
        workingKg,
        barKg: equipment === 'barbell' ? loadToKg(setup.barKg, setup) : null,
        sets: chosen,
        round: warmupRounder(equipment, setup, unit),
      }),
    [workingKg, equipment, setup, unit, chosen],
  );

  /** Plates per side for a row (in the rack's unit), blank for equipment that has none. */
  const platesFor = (kg: number): string => {
    if (equipment !== 'barbell') return '';
    const s = solvePlatesForKg(kg, setup);
    if (s.kind !== 'exact') return '';
    return s.load.plates.length === 0
      ? 'bar'
      : s.load.plates.flatMap((p) => Array<number>(p.n).fill(p.kg)).map(fmt).join(' + ');
  };

  return (
    <DraggableSheet visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Warm-up</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
          <Text style={styles.close}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.sub}>
        Ramps to your first working set · {weightText(workingKg, unit)} {unit} × {workingReps}
      </Text>
      <Text style={styles.subName} numberOfLines={1}>
        {exerciseName}
      </Text>

      <View style={styles.tableHead}>
        <Text style={[styles.headCell, styles.colSet]}>SET</Text>
        <Text style={[styles.headCell, styles.colPct]}>%</Text>
        <Text style={[styles.headCell, styles.colWeight]}>{unitLabel(unit)} × REPS</Text>
        {equipment === 'barbell' && (
          <Text style={[styles.headCell, styles.colPlates]}>PLATES / SIDE</Text>
        )}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>Nothing to ramp — the working weight is already light.</Text>
        ) : (
          rows.map((r, i) => (
            <View key={`${r.kg}-${i}`} style={styles.row}>
              <View style={[styles.colSet, styles.badgeCell]}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>W</Text>
                </View>
              </View>
              <Text style={[styles.cell, styles.colPct]}>{r.pct == null ? 'bar' : `${r.pct}%`}</Text>
              <Text style={[styles.cell, styles.colWeight, styles.cellStrong]}>
                {weightText(r.kg, unit)} × {r.reps}
              </Text>
              {equipment === 'barbell' && (
                <Text style={[styles.cell, styles.colPlates]} numberOfLines={1}>
                  {platesFor(r.kg)}
                </Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.setsRow}>
        <Text style={styles.setsLabel}>Sets</Text>
        <View style={styles.segment}>
          {SET_CHOICES.map((n) => {
            const on = n === chosen;
            return (
              <Pressable
                key={n}
                onPress={() => setSets(n)}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <PressableScale
        style={[styles.insert, rows.length === 0 && styles.insertOff]}
        onPress={() => rows.length > 0 && onInsert(rows)}
        accessibilityRole="button"
      >
        <Text style={styles.insertText}>
          {rows.length === 0
            ? 'Nothing to insert'
            : `Insert ${rows.length} warm-up ${rows.length === 1 ? 'set' : 'sets'}`}
        </Text>
      </PressableScale>
    </DraggableSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 16,
  },
  grabberWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.surface3 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
  close: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text2 },
  sub: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text2, paddingHorizontal: 16, marginTop: 2 },
  subName: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, paddingHorizontal: 16 },

  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  headCell: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.5, color: color.text3 },
  colSet: { width: 34 },
  colPct: { width: 46 },
  colWeight: { flex: 1 },
  colPlates: { flex: 1.2, textAlign: 'right' },

  list: { maxHeight: 240 },
  listContent: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', height: 40 },
  badgeCell: { alignItems: 'flex-start' },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,194,75,0.10)',
  },
  badgeText: { fontFamily: font.monoSemi, fontSize: 11, color: color.warning },
  cell: { fontFamily: font.monoRegular, fontSize: 14, color: color.text2 },
  cellStrong: { fontFamily: font.monoMedium, color: color.text1 },
  empty: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, paddingVertical: 12 },

  setsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  setsLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text1 },
  segment: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: 9, padding: 3, gap: 3 },
  segmentItem: { width: 36, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  segmentItemOn: { backgroundColor: color.surface3 },
  segmentText: { fontFamily: font.monoMedium, fontSize: 13, color: color.text2 },
  segmentTextOn: { color: color.text1 },

  insert: {
    marginHorizontal: 16,
    marginTop: 14,
    height: 50,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insertOff: { backgroundColor: color.surface3 },
  insertText: { fontFamily: font.titleSemi, fontSize: 16, color: color.accentFg },
});
