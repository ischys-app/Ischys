/**
 * Rate or re-rate a set from its row (board 14a, F3).
 *
 * The same scale the rest bar offers, in a sheet, for the cases the rest bar
 * cannot cover: the rest timer is off, the set was mid-superset, the prompt was
 * ignored, the set was logged on the Watch, or the rating was simply wrong. A
 * tap saves and closes; so does Clear rating.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { effortSentence, type EffortScaleKind } from '../../domain/effort';
import type { Unit } from '../../domain/units';
import { color, font } from '../../theme/tokens';
import { DraggableSheet } from '../DraggableSheet';
import { EffortScale } from './EffortScale';

type Props = {
  visible: boolean;
  kind: EffortScaleKind;
  exerciseName: string;
  /** The set's badge — "3", "W". */
  badge: string;
  /**
   * What the set logged, as the row shows it: the weight text in `unit` (blank
   * for a bodyweight set with nothing added) and the reps.
   */
  weight: string;
  reps: string;
  unit: Unit;
  bodyweight: boolean;
  /** The set's rating, as RPE. */
  rpe: number | null;
  /** A value was picked, or (null) the rating was cleared. The caller closes. */
  onRate: (rpe: number | null) => void;
  onClose: () => void;
};

/** "Incline Bench Press (Dumbbell)" titles the sheet as "INCLINE BENCH PRESS". */
const titleName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '').toUpperCase();

/** What the scale means before it is touched, as a sentence. */
const UNRATED: Record<EffortScaleKind, string> = {
  rpe: '8 means about two reps left in the tank.',
  rir: '0 means nothing left in the tank.',
};

export function EffortSheet({
  visible,
  kind,
  exerciseName,
  badge,
  weight,
  reps,
  unit,
  bodyweight,
  rpe,
  onRate,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) setPreview(null);
  }, [visible]);

  const shown = preview ?? rpe;
  const hasWeight = weight.trim() !== '';
  // Bodyweight reads "BW × 11", or "+10 kg × 6" with weight added.
  const lead = bodyweight ? (hasWeight ? `+${weight}` : 'BW') : hasWeight ? weight : '—';
  const joiner = bodyweight && !hasWeight ? ' × ' : ` ${unit} × `;

  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      // 34 is the board's bottom padding, which is the home-indicator inset.
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 34) }]}
    >
      <View style={styles.grabber} />
      <Text style={styles.title} numberOfLines={1}>
        {`${titleName(exerciseName)} · SET ${badge}`}
      </Text>
      <Text style={styles.value} numberOfLines={1}>
        {lead}
        <Text style={styles.valueJoin}>{joiner}</Text>
        {reps.trim() !== '' ? reps : '—'}
      </Text>

      <View style={styles.scale}>
        <EffortScale kind={kind} value={rpe} size="sheet" onPreview={setPreview} onCommit={onRate} />
      </View>
      <View style={styles.ends}>
        <Text style={styles.end}>EASIER</Text>
        <Text style={styles.end}>NOTHING LEFT</Text>
      </View>

      <Text style={styles.meaning}>
        {shown != null ? effortSentence(shown, kind) : UNRATED[kind]}
      </Text>

      {/* Nothing to clear on an unrated set, so the button isn't there. */}
      {rpe != null ? (
        <Pressable
          onPress={() => onRate(null)}
          style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
        >
          <Text style={styles.clearText}>Clear rating</Text>
        </Pressable>
      ) : null}
    </DraggableSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.surface1,
    borderTopWidth: 1,
    borderTopColor: color.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 18,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.surface3,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  value: {
    fontFamily: font.monoMedium,
    fontSize: 28,
    color: color.text1,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  valueJoin: { fontSize: 15, color: color.text3 },
  scale: { marginTop: 18 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  end: {
    fontFamily: font.monoRegular,
    fontSize: 10.5,
    letterSpacing: 0.84,
    color: color.text3,
  },
  meaning: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    lineHeight: 19.5,
    color: color.text2,
    marginTop: 14,
  },
  clear: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  clearPressed: { borderColor: color.text3 },
  clearText: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text2 },
});
