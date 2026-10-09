/** One exercise: header, note, rest-timer row, set grid, + Add Set. */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { effortRowLine, type EffortScaleKind } from '../../domain/effort';
import type { Unit } from '../../domain/units';
import { exerciseArt } from '../../lib/exerciseArt';
import { color, font } from '../../theme/tokens';
import { textScale } from '../../theme/textScale';
import { ExerciseArt } from '../ExerciseArt';
import { PressableScale } from '../PressableScale';
import { ChevronRightIcon, ClockRowIcon, StarIcon } from '../icons';
import { ExerciseMenu } from './ExerciseMenu';
import { carryFor } from './setCarry';
import { SetRow } from './SetRow';
import { exerciseMeta, restLabel, weightColumnLabel, type Exercise, type SetType } from './types';

type Props = {
  exercise: Exercise;
  /** The unit the exercise's weight strings are in — labels the column and PREV. */
  unit: Unit;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onNoteChange: (text: string) => void;
  onOpenRest: () => void;
  onAddSet: () => void;
  onCycleType: (setId: string) => void;
  onUsePrev: (setId: string) => void;
  onWeightChange: (setId: string, text: string) => void;
  onRepsChange: (setId: string, text: string) => void;
  onToggleDone: (setId: string) => void;
  /** Relays which set's weight/reps field is focused, for the keyboard toolbar. */
  onFieldFocus?: (setId: string, field: 'weight' | 'reps') => void;
  /** Per-set progression proposal, keyed by set id (#69). */
  suggestionFor?: (setId: string) => { kind: 'up' | 'hold' | 'down'; weight: number; reps: number } | null;
  onUseSuggestion?: (setId: string) => void;
  /**
   * Effort per set (#84). Absent — the setting is Off — and every row renders
   * exactly as it does without the feature.
   */
  effort?: { kind: EffortScaleKind; onOpen: (setId: string) => void } | null;
  /** Offers the warm-up ramp. Absent → the button isn't shown (see below). */
  onWarmup?: () => void;
  /** e.g. "A1" — this exercise's place in its superset. Absent when solo. */
  supersetTag?: string | null;
  /** Opens the partner picker, or leaves the group. Absent → not offered. */
  onSuperset?: () => void;
  inSuperset?: boolean;
  /** Rest is owned by whoever closes the round; earlier partners say so. */
  restOverrideLabel?: string | null;
  /** Delete a set. Omitted → swipe-to-delete disabled. */
  onDeleteSet?: (setId: string) => void;
  /** Id of the set whose swipe panel is currently revealed (single per screen). */
  openSetId?: string | null;
  /** A set's swipe panel opened/closed. */
  onSetOpenChange?: (setId: string, open: boolean) => void;
  /** Open the full-screen reorder overlay (menu action). */
  onReorderStart: () => void;
  /** Tap on the avatar or name — routes to Exercise Detail. No-op when omitted. */
  onOpenDetail?: () => void;
  /**
   * Editing a finished workout (#83, board 13a): the same card without the
   * note, the Rest Timer row, the ticks or the done bars, and with PREV as
   * WAS. Absent → the live card, exactly as it has always been.
   */
  edit?: {
    /** Per set: its WAS label and — for a set left unticked — the tap that
     *  logs it, or takes that back. */
    setState: (setId: string) => { was: string; onWasPress?: () => void };
    onRemoveSet: (setId: string) => void;
    /** Shown in place of the rows while the exercise has none and cannot be
     *  saved that way. */
    emptyHint?: string | null;
    /** The neutral line shown while this exercise has a record moving. */
    recordLine?: string | null;
  };
};

/** "dumbbell" -> "Dumbbell". Equipment is stored as a lowercase slug. */
const titleCase = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/** Badge glyph for each set: working-set index for normal, letter otherwise. */
function badgeFor(type: SetType, workingIndex: number): string {
  if (type === 'normal') return String(workingIndex);
  if (type === 'warmup') return 'W';
  if (type === 'drop') return 'D';
  return 'F';
}

export function ExerciseCard({
  exercise,
  unit,
  menuOpen,
  onToggleMenu,
  onReplace,
  onRemove,
  onNoteChange,
  onOpenRest,
  onAddSet,
  onCycleType,
  onUsePrev,
  onWeightChange,
  onRepsChange,
  onToggleDone,
  onFieldFocus,
  suggestionFor,
  onUseSuggestion,
  effort,
  onWarmup,
  supersetTag,
  onSuperset,
  inSuperset,
  restOverrideLabel,
  onDeleteSet,
  openSetId,
  onSetOpenChange,
  onReorderStart,
  onOpenDetail,
  edit,
}: Props) {
  const hasDone = exercise.sets.some((s) => s.done);
  const firstUndone = exercise.sets.findIndex((s) => !s.done);
  let working = 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={[styles.header, edit && styles.headerEdit]}>
        <Pressable
          style={styles.avatar}
          onPress={onOpenDetail}
          disabled={!onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel={`About ${exercise.name}`}
        >
          {(() => {
            // Line art when we have it for this movement, initials otherwise.
            // Held on the first frame here: this is a dense list mid-workout, so a
            // looping figure in every card would pull focus from logging.
            const art = exerciseArt(exercise.exerciseCatalogId);
            return art ? (
              <ExerciseArt
                frames={art.frames}
                viewBox={art.viewBox}
                size={34}
                tint={color.text1}
                animate={false}
              />
            ) : (
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.avatarText}>{exercise.initials}</Text>
            );
          })()}
        </Pressable>
        <Pressable style={styles.headerText} onPress={onOpenDetail} disabled={!onOpenDetail}>
          {/* A long name wraps to two lines while editing (E7); live keeps one. */}
          <Text maxFontSizeMultiplier={textScale.display} style={[styles.name, edit && styles.nameEdit]} numberOfLines={edit ? undefined : 1}>
            {exercise.name}
          </Text>
          <View style={styles.metaRow}>
            {/* Position within the group, at the start of the meta line. No new
                colour — surface3 on the existing grey. */}
            {supersetTag ? (
              <View style={styles.ssTag}>
                <Text maxFontSizeMultiplier={textScale.fixed} style={styles.ssTagText}>{supersetTag}</Text>
              </View>
            ) : null}
            <Text maxFontSizeMultiplier={textScale.control} style={styles.meta} numberOfLines={1}>
              {edit ? titleCase(exercise.equipment) : exerciseMeta(exercise)}
            </Text>
          </View>
        </Pressable>
        <View style={styles.menuAnchor}>
          <Pressable
            onPress={onToggleMenu}
            style={styles.menuButton}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`More options for ${exercise.name}`}
          >
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.menuGlyph}>{'⋯'}</Text>
          </Pressable>
          {menuOpen && (
            <ExerciseMenu
              onReorderStart={onReorderStart}
              onReplace={onReplace}
              onSuperset={onSuperset}
              inSuperset={inSuperset}
              onRemove={onRemove}
            />
          )}
        </View>
      </View>

      {edit ? (
        // Neutral on purpose: losing a record that was never lifted is not a
        // warning, so this is surface2 and text2, never success or error.
        edit.recordLine ? (
          <View style={styles.recordLine}>
            <View style={styles.recordStar}>
              <StarIcon size={13} color={color.text2} strokeWidth={2.4} />
            </View>
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.recordText}>{edit.recordLine}</Text>
          </View>
        ) : null
      ) : (
        <>
          {/* Note — warmup-tinted when populated (design source) */}
          <TextInput
            value={exercise.note}
            onChangeText={onNoteChange}
            placeholder={exercise.notePlaceholder ?? 'Add notes here…'}
            placeholderTextColor={color.text3}
            accessibilityLabel={`Notes for ${exercise.name}`}
            multiline
            style={[styles.note, exercise.note.length > 0 && styles.noteFilled]}
          />

          {/* Rest timer row */}
          <Pressable onPress={onOpenRest} style={styles.restRow}>
            <ClockRowIcon size={15} color={color.accent} strokeWidth={2.4} />
            <Text maxFontSizeMultiplier={textScale.control} style={styles.restLabel}>Rest Timer</Text>
            <View style={styles.restRight}>
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.restValue}>
                {restOverrideLabel ?? restLabel(exercise.rest)}
              </Text>
              <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.4} />
            </View>
          </Pressable>
        </>
      )}

      {/* Column labels */}
      <View style={[styles.colHeader, edit && styles.colHeaderEdit]}>
        <Text maxFontSizeMultiplier={textScale.fixed} style={[styles.colLabel, styles.colSet]}>SET</Text>
        <Text maxFontSizeMultiplier={textScale.fixed} style={[styles.colLabel, styles.colPrev]}>{edit ? 'WAS' : 'PREV'}</Text>
        <Text maxFontSizeMultiplier={textScale.fixed} style={[styles.colLabel, styles.colWeight]}>{weightColumnLabel(exercise, unit)}</Text>
        <Text maxFontSizeMultiplier={textScale.fixed} style={[styles.colLabel, styles.colReps]}>REPS</Text>
        <View style={styles.colCheck} />
      </View>

      {/* Set rows */}
      <View style={styles.sets}>
        {/* The "active" row is the set you are about to do: the first undone set,
            but only once something in this exercise has been completed. */}
        {exercise.sets.map((s, idx) => {
          if (s.type === 'normal') working += 1;
          const carry = carryFor(exercise.sets, idx);
          if (edit) {
            const state = edit.setState(s.id);
            return (
              <SetRow
                key={s.id}
                exercise={exercise}
                set={s}
                unit={unit}
                badge={badgeFor(s.type, working)}
                onCycleType={() => onCycleType(s.id)}
                onUsePrev={() => onUsePrev(s.id)}
                onWeightChange={(t) => onWeightChange(s.id, t)}
                onRepsChange={(t) => onRepsChange(s.id, t)}
                onToggleDone={() => onToggleDone(s.id)}
                onFieldFocus={(field) => onFieldFocus?.(s.id, field)}
                onDelete={onDeleteSet ? () => onDeleteSet(s.id) : undefined}
                isOpen={openSetId === s.id}
                onOpenChange={(o) => onSetOpenChange?.(s.id, o)}
                // No carried placeholders: Save writes what a field holds, so
                // an empty field has to look empty.
                edit={{
                  was: state.was,
                  onRemove: () => edit.onRemoveSet(s.id),
                  onWasPress: state.onWasPress,
                }}
              />
            );
          }
          const active = hasDone && idx === firstUndone;
          const suggestion = suggestionFor?.(s.id) ?? null;
          return (
            <SetRow
              key={s.id}
              exercise={exercise}
              set={s}
              unit={unit}
              badge={badgeFor(s.type, working)}
              onCycleType={() => onCycleType(s.id)}
              onUsePrev={() => onUsePrev(s.id)}
              onWeightChange={(t) => onWeightChange(s.id, t)}
              onRepsChange={(t) => onRepsChange(s.id, t)}
              onToggleDone={() => onToggleDone(s.id)}
              onFieldFocus={(field) => onFieldFocus?.(s.id, field)}
              suggestion={suggestion}
              onUseSuggestion={() => onUseSuggestion?.(s.id)}
              effortLine={
                effort
                  ? effortRowLine({
                      mode: effort.kind,
                      done: s.done,
                      rpe: s.rpe,
                      prevRpe: s.prevRpe,
                      hasSuggestion: !!suggestion,
                    })
                  : undefined
              }
              onEffortPress={effort ? () => effort.onOpen(s.id) : undefined}
              onDelete={onDeleteSet ? () => onDeleteSet(s.id) : undefined}
              isOpen={openSetId === s.id}
              onOpenChange={(o) => onSetOpenChange?.(s.id, o)}
              carryWeight={carry.weight}
              carryReps={carry.reps}
              active={active}
            />
          );
        })}
        {edit?.emptyHint ? <Text style={styles.emptyHint}>{edit.emptyHint}</Text> : null}
      </View>

      {/* + Add Set, sharing its row with Warm-up when a ramp is on offer. The
          caller withholds `onWarmup` once the exercise already has a warm-up, or
          when there's no working weight to ramp toward — if it isn't needed, it
          isn't there, rather than sitting disabled. */}
      <View style={styles.footerRow}>
        <PressableScale onPress={onAddSet} style={[styles.addSet, styles.footerHalf]}>
          <Text maxFontSizeMultiplier={textScale.control} style={styles.addSetText}>+ Add Set</Text>
        </PressableScale>
        {onWarmup && (
          <PressableScale
            onPress={onWarmup}
            style={[styles.addSet, styles.footerHalf]}
            accessibilityRole="button"
            accessibilityLabel="Add warm-up sets"
          >
            {/* Warning is the warm-up set-type colour, so the button matches the
                W badges it creates. */}
            <Text maxFontSizeMultiplier={textScale.control} style={[styles.addSetText, styles.warmupText]}>Warm-up</Text>
          </PressableScale>
        )}
      </View>
    </View>
  );
}

const GRID_GAP = 8;

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Edit mode (13a): the name may wrap, so the avatar and ⋯ sit at the top.
  headerEdit: { alignItems: 'flex-start' },
  nameEdit: { lineHeight: 19 },
  recordLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 12,
    marginHorizontal: 2,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: color.surface2,
  },
  recordStar: { marginTop: 1 },
  recordText: {
    flex: 1,
    fontFamily: font.monoRegular,
    fontSize: 11,
    lineHeight: 16.5,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  colHeaderEdit: { paddingTop: 12 },
  // The WAS cell's own type, for a card with no row to carry a WAS cell.
  emptyHint: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    lineHeight: 17,
    color: color.text3,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  avatarText: { fontFamily: font.monoSemi, fontSize: 13, color: color.accent },
  headerText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    lineHeight: 18,
    color: color.accent,
  },
  meta: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3, marginTop: 1 },
  menuAnchor: { position: 'relative' },
  menuButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuGlyph: { fontSize: 19, lineHeight: 19, color: color.text3 },

  note: {
    marginTop: 10,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 10,
    color: color.warning,
    fontFamily: font.bodyRegular,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 38,
    textAlignVertical: 'top',
  },
  noteFilled: {
    backgroundColor: 'rgba(255,194,75,0.07)',
    borderColor: 'rgba(255,194,75,0.22)',
  },

  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  restLabel: { fontFamily: font.bodyMedium, fontSize: 13, color: color.text2 },
  restRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  restValue: {
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },

  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID_GAP,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  colLabel: {
    fontFamily: font.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.76,
    color: color.text3,
  },
  colSet: { width: 34, textAlign: 'center' },
  colPrev: { flex: 1 },
  colWeight: { width: 74, textAlign: 'center' },
  colReps: { width: 56, textAlign: 'center' },
  colCheck: { width: 40 },

  sets: { flexDirection: 'column', gap: 2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ssTag: {
    backgroundColor: color.surface3,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ssTagText: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 0.5,
    color: color.text2,
  },
  footerRow: { flexDirection: 'row', gap: 8 },
  footerHalf: { flex: 1 },
  warmupText: { color: color.warning },
  addSet: {
    marginTop: 8,
    width: '100%',
    height: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetText: { fontFamily: font.titleSemi, fontSize: 12.5, color: color.text2 },
});
