/** A single logged-set row — grid: [34 | 1fr | 74 | 56 | 40], height 50. Pixel-critical. */
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { color, font } from '../../theme/tokens';

/**
 * Native id of the "Done" bar shown above the weight/reps keypads. Those are
 * numeric keyboards with no return key, so this accessory is the only way to
 * dismiss them. The bar itself is rendered once by the workout screen; every set
 * input just references it by id. iOS-only (ignored elsewhere).
 */
export const KEYBOARD_ACCESSORY_ID = 'ischys-workout-keyboard';
const accessoryId = Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined;
import { CheckIcon } from '../icons';
import { SwipeToDelete } from './SwipeToDelete';
import { prevLabel, typeMeta, type Exercise, type WorkoutSet } from './types';

type Props = {
  exercise: Exercise;
  set: WorkoutSet;
  /** Precomputed badge glyph: working-set index ("1") or type letter ("W"/"D"/"F"). */
  badge: string;
  onCycleType: () => void;
  onUsePrev: () => void;
  onWeightChange: (text: string) => void;
  onRepsChange: (text: string) => void;
  onToggleDone: () => void;
  /** Fired by the swipe-revealed Delete button. Omitted → swipe disabled, no panel. */
  onDelete?: () => void;
  /** This row's swipe panel is revealed. */
  isOpen?: boolean;
  /** Notify the parent when this row opens/closes so it can keep a single open row. */
  onOpenChange?: (open: boolean) => void;
  /** First not-yet-done set of an exercise that already has a done set. */
  active?: boolean;
  /** Values carried down from the nearest filled set above; shown as placeholders. */
  carryWeight?: string;
  carryReps?: string;
};

export function SetRow({
  exercise,
  set,
  badge,
  onCycleType,
  onUsePrev,
  onWeightChange,
  onRepsChange,
  onToggleDone,
  onDelete,
  isOpen = false,
  onOpenChange,
  active = false,
  carryWeight,
  carryReps,
}: Props) {
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);

  const meta = typeMeta[set.type];
  const prev = prevLabel(exercise, set);
  // This session's carried values beat last session's reference, which is only
  // a hint. Bodyweight has no weight column to carry.
  const phWeight =
    exercise.kind === 'bodyweight' ? 'BW' : carryWeight ?? set.prevWeight ?? '';
  const phReps = carryReps ?? set.prevReps ?? '';

  return (
    <SwipeToDelete
      onDelete={onDelete}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      accessibilityLabel={`Delete set ${badge}`}
      radius={10}
      rowStyle={[
        styles.row,
        // Opaque, and state-driven: the red delete panel sits behind this row.
        { backgroundColor: set.done ? color.setRowDone : active ? color.setRowActive : color.surface1 },
      ]}
    >
      <>
        {set.done && <View style={styles.doneBar} />}
        {active && <View style={[styles.doneBar, styles.activeBar]} />}

        {/* Type badge */}
        <View style={styles.badgeCell}>
          <Pressable
            onPress={onCycleType}
            style={[styles.badge, { backgroundColor: meta.tintBg }]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Set ${badge}, ${set.type}`}
            accessibilityHint="Tap to change set type."
          >
            <Text style={[styles.badgeText, { color: meta.color }]}>{badge}</Text>
          </Pressable>
        </View>

        {/* Previous set reference */}
        <Pressable onPress={onUsePrev} style={styles.prevCell} hitSlop={{ top: 8, bottom: 8 }}>
          <Text style={styles.prevText} numberOfLines={1}>
            {prev}
          </Text>
        </Pressable>

        {/* Weight */}
        <TextInput
          value={set.weight}
          onChangeText={onWeightChange}
          onFocus={() => setWeightFocused(true)}
          onBlur={() => setWeightFocused(false)}
          placeholder={phWeight}
          placeholderTextColor={color.text3}
          keyboardType="decimal-pad"
          inputAccessoryViewID={accessoryId}
          style={[styles.input, styles.weightInput, weightFocused && styles.inputFocused]}
        />

        {/* Reps */}
        <TextInput
          value={set.reps}
          onChangeText={onRepsChange}
          onFocus={() => setRepsFocused(true)}
          onBlur={() => setRepsFocused(false)}
          placeholder={phReps}
          placeholderTextColor={color.text3}
          keyboardType="number-pad"
          inputAccessoryViewID={accessoryId}
          style={[styles.input, styles.repsInput, repsFocused && styles.inputFocused]}
        />

        {/* Done toggle */}
        <View style={styles.checkCell}>
          <Pressable
            onPress={onToggleDone}
            style={[styles.check, set.done ? styles.checkDone : styles.checkIdle]}
          >
            <CheckIcon
              size={18}
              color={set.done ? color.accentFg : color.text3}
              strokeWidth={set.done ? 3.2 : 3}
            />
          </Pressable>
        </View>
      </>
    </SwipeToDelete>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 50,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  doneBar: {
    position: 'absolute',
    left: 0,
    top: 9,
    bottom: 9,
    width: 3,
    borderRadius: 3,
    backgroundColor: color.accent,
  },
  /** Same bar, dimmed — marks the set you are about to do. */
  activeBar: { opacity: 0.35 },
  badgeCell: { width: 34, alignItems: 'center', justifyContent: 'center' },
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
  prevCell: { flex: 1, justifyContent: 'center', paddingHorizontal: 2 },
  prevText: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  input: {
    height: 38,
    textAlign: 'center',
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 8,
    color: color.text1,
    fontFamily: font.monoMedium,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
  },
  weightInput: { width: 74 },
  repsInput: { width: 56 },
  inputFocused: { borderColor: color.accent, backgroundColor: color.surface3 },
  checkCell: { width: 40, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: color.accent },
  checkIdle: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.border },
});
