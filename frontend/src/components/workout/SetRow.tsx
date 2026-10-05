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

import type { EffortRowLine } from '../../domain/effort';
import type { Unit } from '../../domain/units';
import { color, font } from '../../theme/tokens';

/**
 * Native id of the "Done" bar shown above the weight/reps keypads. Those are
 * numeric keyboards with no return key, so this accessory is the only way to
 * dismiss them. The bar itself is rendered once by the workout screen; every set
 * input just references it by id. iOS-only (ignored elsewhere).
 */
export const KEYBOARD_ACCESSORY_ID = 'ischys-workout-keyboard';
const accessoryId = Platform.OS === 'ios' ? KEYBOARD_ACCESSORY_ID : undefined;
import { CheckIcon, RemoveCircleIcon } from '../icons';
import { SwipeToDelete } from './SwipeToDelete';
import { prevLabel, typeMeta, type Exercise, type WorkoutSet } from './types';

type Props = {
  exercise: Exercise;
  set: WorkoutSet;
  /** The unit the set's weight strings (and the suggestion) are in. */
  unit: Unit;
  /** Precomputed badge glyph: working-set index ("1") or type letter ("W"/"D"/"F"). */
  badge: string;
  onCycleType: () => void;
  onUsePrev: () => void;
  onWeightChange: (text: string) => void;
  onRepsChange: (text: string) => void;
  onToggleDone: () => void;
  /** Fired when the weight or reps field takes focus, so the screen knows which
   *  set the keyboard toolbar is acting on. */
  onFieldFocus?: (field: 'weight' | 'reps') => void;
  /** Next-session proposal for this set (#69). Absent → the row shows none. */
  suggestion?: { kind: 'up' | 'hold' | 'down'; weight: number; reps: number } | null;
  /** Fills both inputs from the suggestion. Must NOT tick the set. */
  onUseSuggestion?: () => void;
  /**
   * The effort line for PREV's second slot (#84): last session's rating, this
   * set's, or the way in to add one. Absent → the row is exactly the row
   * without the feature. A suggestion showing on an undone set keeps the slot.
   */
  effortLine?: EffortRowLine | null;
  /** Opens the rating sheet, from a rating or `+ RPE`. `last @9` is not a way in. */
  onEffortPress?: () => void;
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
  /**
   * Editing a finished workout (#83, board 13a). The same row with everything
   * that says "in progress" taken away: no done or active bar, no tick, and
   * PREV becomes WAS. Absent → the live row, exactly as it has always been.
   */
  edit?: {
    /** What the set was before this edit, "new", or empty while unchanged. */
    was: string;
    /** The tick column's replacement. Swipe-to-delete still works beside it. */
    onRemove: () => void;
    /** Present on a set that was left unticked: tapping WAS logs it, and
     *  tapping again takes that back. */
    onWasPress?: () => void;
  };
};

/** The row's own 5pt of padding above and below the PREV cell: 40 + 10 = the full 50. */
const PREV_TAP_SLOP = { top: 5, bottom: 5 };

/** Arrow up / equals / arrow down. Meaning lives here, not in colour. */
const GLYPH = { up: '\u2191', hold: '=', down: '\u2193' } as const;

/** 102.5 stays, 100.0 becomes 100. */
const fmtNum = (n: number): string => String(Math.round(n * 100) / 100);

export function SetRow({
  exercise,
  set,
  unit,
  badge,
  onCycleType,
  onUsePrev,
  onWeightChange,
  onRepsChange,
  onToggleDone,
  onFieldFocus,
  suggestion,
  onUseSuggestion,
  effortLine,
  onEffortPress,
  onDelete,
  isOpen = false,
  onOpenChange,
  active = false,
  carryWeight,
  carryReps,
  edit,
}: Props) {
  const [weightFocused, setWeightFocused] = useState(false);
  const [repsFocused, setRepsFocused] = useState(false);

  // "Edited" means the row no longer matches what was proposed — typing any
  // value overrides it, and the line dims rather than disappearing so you can
  // still see what you changed from.
  const edited =
    !!suggestion &&
    (set.weight.trim() !== '' || set.reps.trim() !== '') &&
    !(Number(set.weight) === suggestion.weight && Number(set.reps) === suggestion.reps);

  const meta = typeMeta[set.type];
  const prev = prevLabel(exercise, set);
  // This session's carried values beat last session's reference, which is only
  // a hint. Bodyweight has no weight column to carry.
  const phWeight =
    exercise.kind === 'bodyweight' ? 'BW' : carryWeight ?? set.prevWeight ?? '';
  const phReps = carryReps ?? set.prevReps ?? '';
  // Set only on a done row with effort ratings on; null leaves the cell as it
  // always was.
  const effortTap =
    set.done && onEffortPress && effortLine && effortLine.kind !== 'last' ? effortLine : null;

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
        {
          backgroundColor: edit
            ? color.surface1
            : set.done
              ? color.setRowDone
              : active
                ? color.setRowActive
                : color.surface1,
        },
      ]}
    >
      <>
        {!edit && set.done && <View style={styles.doneBar} />}
        {!edit && active && <View style={[styles.doneBar, styles.activeBar]} />}

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
        {/* PREV, and under it the suggestion. This is the only flexible column
            in the row's [34 | 1fr | 74 | 56 | 40] grid, and two 11-12px lines
            fit the 50pt height — so nothing reflows when one appears. */}
        {edit ? (
          // WAS, in PREV's own 1fr cell, so nothing reflows when it fills in.
          edit.onWasPress ? (
            // The whole cell at the row's full height, as the live row does
            // for its effort line: an 11.5px label is too small to aim at.
            <Pressable
              style={[styles.wasCell, styles.prevCellTap]}
              onPress={edit.onWasPress}
              hitSlop={PREV_TAP_SLOP}
              accessibilityRole="button"
              accessibilityLabel={`Set ${badge}, ${edit.was}`}
              accessibilityHint="Switches this set between done and not done"
            >
              <Text style={styles.wasText} numberOfLines={1}>
                {edit.was}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.wasCell}>
              <Text style={styles.wasText} numberOfLines={1}>
                {edit.was}
              </Text>
            </View>
          )
        ) : effortTap ? (
          // A done row with ratings on: the whole cell, at the row's full
          // height, is the way in. Its two lines are 11-12px, far too small to
          // aim at, and with the rest timer off this is the only way to rate.
          <Pressable
            style={[styles.prevCell, styles.prevCellTap]}
            onPress={onEffortPress}
            hitSlop={PREV_TAP_SLOP}
            accessibilityRole="button"
            accessibilityLabel={
              effortTap.kind === 'add' ? 'Rate this set' : `Effort ${effortTap.text}`
            }
            accessibilityHint="Opens the effort scale"
          >
            <Text style={styles.prevText} numberOfLines={1}>
              {prev}
            </Text>
            <Text style={[styles.effortText, effortStyles[effortTap.kind]]} numberOfLines={1}>
              {effortTap.text}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.prevCell}>
            <Pressable onPress={onUsePrev} hitSlop={{ top: 6, bottom: 2 }}>
              <Text style={styles.prevText} numberOfLines={1}>
                {prev}
              </Text>
            </Pressable>
            {/* Gone once the set is logged: it has served its purpose, and the
                row is about what happened from then on. */}
            {suggestion && !set.done ? (
              <Pressable
                onPress={onUseSuggestion}
                hitSlop={{ top: 2, bottom: 6 }}
                accessibilityRole="button"
                accessibilityLabel={`Suggested ${fmtNum(suggestion.weight)} ${unit} by ${suggestion.reps}`}
                accessibilityHint="Fills this set with the suggestion"
              >
                <Text
                  style={[
                    styles.suggestText,
                    // Dimmed once the user has typed something: it stays visible
                    // so they can see what they changed from, without competing.
                    edited && styles.suggestTextEdited,
                    // Glyphs carry the meaning, not colour. Down is the one
                    // exception, and only while a deload is running.
                    suggestion.kind === 'down' && styles.suggestTextDown,
                  ]}
                  numberOfLines={1}
                >
                  {`${GLYPH[suggestion.kind]} ${fmtNum(suggestion.weight)} × ${suggestion.reps}`}
                </Text>
              </Pressable>
            ) : effortLine ? (
              // `last @9` is a reference and does nothing; the done row's line —
              // the rating, or `+ RPE` — opens the scale.
              effortLine.kind === 'last' || !onEffortPress ? (
                <Text style={[styles.effortText, effortStyles[effortLine.kind]]} numberOfLines={1}>
                  {effortLine.text}
                </Text>
              ) : (
                <Pressable
                  onPress={onEffortPress}
                  hitSlop={{ top: 2, bottom: 12, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    effortLine.kind === 'add' ? 'Rate this set' : `Effort ${effortLine.text}`
                  }
                  accessibilityHint="Opens the effort scale"
                >
                  <Text style={[styles.effortText, effortStyles[effortLine.kind]]} numberOfLines={1}>
                    {effortLine.text}
                  </Text>
                </Pressable>
              )
            ) : null}
          </View>
        )}

        {/* Weight */}
        <TextInput
          value={set.weight}
          onChangeText={onWeightChange}
          onFocus={() => {
            setWeightFocused(true);
            onFieldFocus?.('weight');
          }}
          onBlur={() => setWeightFocused(false)}
          placeholder={phWeight}
          placeholderTextColor={color.text3}
          keyboardType="decimal-pad"
          // Tapping a set's weight means replacing it, not editing a digit of it:
          // these are 2-4 character values, and the carried-forward number is
          // usually wrong in full rather than wrong in one place. Selecting it all
          // makes the next keypress overwrite instead of forcing a backspace hold.
          selectTextOnFocus
          inputAccessoryViewID={accessoryId}
          style={[styles.input, styles.weightInput, weightFocused && styles.inputFocused]}
        />

        {/* Reps */}
        <TextInput
          value={set.reps}
          onChangeText={onRepsChange}
          onFocus={() => {
            setRepsFocused(true);
            onFieldFocus?.('reps');
          }}
          onBlur={() => setRepsFocused(false)}
          placeholder={phReps}
          placeholderTextColor={color.text3}
          keyboardType="number-pad"
          selectTextOnFocus
          inputAccessoryViewID={accessoryId}
          style={[styles.input, styles.repsInput, repsFocused && styles.inputFocused]}
        />

        {edit ? (
          // In a finished workout every set is done, so a column of accent
          // ticks would only compete with Save. It removes the set instead.
          <Pressable
            onPress={edit.onRemove}
            style={styles.removeCell}
            accessibilityRole="button"
            accessibilityLabel={`Remove set ${badge}`}
          >
            <RemoveCircleIcon size={20} color={color.text3} strokeWidth={2} />
          </Pressable>
        ) : (
          /* Done toggle */
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
        )}
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
  prevCell: { flex: 1, justifyContent: 'center', paddingHorizontal: 2, gap: 1 },
  // Fills the row's inner height so the tap target is not just the text. The
  // lines stay centred, so nothing moves.
  prevCellTap: { alignSelf: 'stretch' },
  prevText: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  // One step brighter than PREV (text3) and never accent or success — a
  // proposal should not look like something that already happened.
  suggestText: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  suggestTextEdited: { color: color.text3 },
  // The effort line shares the suggestion's slot and size; weight and colour
  // say which kind it is (see `effortStyles`).
  effortText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  suggestTextDown: { color: color.warning },
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
  // Edit mode (13a). WAS sits flush in the cell, under its column label.
  wasCell: { flex: 1, minWidth: 0, justifyContent: 'center' },
  wasText: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  // 40 wide like the tick column it replaces, and a full 44 tall: the row's
  // own padding leaves 40, so it reaches 2pt into it on each side.
  removeCell: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: color.accent },
  checkIdle: { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.border },
});

/** Last session's rating recedes; today's is one step brighter; `+ RPE` is a quiet way in. */
const effortStyles = StyleSheet.create({
  last: { fontFamily: font.monoRegular, color: color.text3 },
  today: { fontFamily: font.monoMedium, color: color.text2 },
  add: { fontFamily: font.monoMedium, color: color.text3 },
});
