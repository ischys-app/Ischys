/** One exercise: header, note, rest-timer row, set grid, + Add Set. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { ChevronRightIcon, ClockRowIcon } from '../icons';
import { ExerciseMenu } from './ExerciseMenu';
import { carryFor } from './setCarry';
import { SetRow } from './SetRow';
import { exerciseMeta, restLabel, weightColumnLabel, type Exercise, type SetType } from './types';

type Props = {
  exercise: Exercise;
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
};

/** Badge glyph for each set: working-set index for normal, letter otherwise. */
function badgeFor(type: SetType, workingIndex: number): string {
  if (type === 'normal') return String(workingIndex);
  if (type === 'warmup') return 'W';
  if (type === 'drop') return 'D';
  return 'F';
}

export function ExerciseCard({
  exercise,
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
  onDeleteSet,
  openSetId,
  onSetOpenChange,
  onReorderStart,
  onOpenDetail,
}: Props) {
  const [addPressed, setAddPressed] = useState(false);
  const hasDone = exercise.sets.some((s) => s.done);
  const firstUndone = exercise.sets.findIndex((s) => !s.done);
  let working = 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.avatar} onPress={onOpenDetail} disabled={!onOpenDetail}>
          <Text style={styles.avatarText}>{exercise.initials}</Text>
        </Pressable>
        <Pressable style={styles.headerText} onPress={onOpenDetail} disabled={!onOpenDetail}>
          <Text style={styles.name} numberOfLines={1}>
            {exercise.name}
          </Text>
          <Text style={styles.meta}>{exerciseMeta(exercise)}</Text>
        </Pressable>
        <View style={styles.menuAnchor}>
          <Pressable onPress={onToggleMenu} style={styles.menuButton} hitSlop={6}>
            <Text style={styles.menuGlyph}>{'⋯'}</Text>
          </Pressable>
          {menuOpen && (
            <ExerciseMenu
              onReorderStart={onReorderStart}
              onReplace={onReplace}
              onRemove={onRemove}
            />
          )}
        </View>
      </View>

      {/* Note — warmup-tinted when populated (design source) */}
      <TextInput
        value={exercise.note}
        onChangeText={onNoteChange}
        placeholder={exercise.notePlaceholder ?? 'Add notes here…'}
        placeholderTextColor={color.text3}
        multiline
        style={[styles.note, exercise.note.length > 0 && styles.noteFilled]}
      />

      {/* Rest timer row */}
      <Pressable onPress={onOpenRest} style={styles.restRow}>
        <ClockRowIcon size={15} color={color.accent} strokeWidth={2.4} />
        <Text style={styles.restLabel}>Rest Timer</Text>
        <View style={styles.restRight}>
          <Text style={styles.restValue}>{restLabel(exercise.rest)}</Text>
          <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.4} />
        </View>
      </Pressable>

      {/* Column labels */}
      <View style={styles.colHeader}>
        <Text style={[styles.colLabel, styles.colSet]}>SET</Text>
        <Text style={[styles.colLabel, styles.colPrev]}>PREV</Text>
        <Text style={[styles.colLabel, styles.colWeight]}>{weightColumnLabel(exercise)}</Text>
        <Text style={[styles.colLabel, styles.colReps]}>REPS</Text>
        <View style={styles.colCheck} />
      </View>

      {/* Set rows */}
      <View style={styles.sets}>
        {/* The "active" row is the set you are about to do: the first undone set,
            but only once something in this exercise has been completed. */}
        {exercise.sets.map((s, idx) => {
          if (s.type === 'normal') working += 1;
          const carry = carryFor(exercise.sets, idx);
          const active = hasDone && idx === firstUndone;
          return (
            <SetRow
              key={s.id}
              exercise={exercise}
              set={s}
              badge={badgeFor(s.type, working)}
              onCycleType={() => onCycleType(s.id)}
              onUsePrev={() => onUsePrev(s.id)}
              onWeightChange={(t) => onWeightChange(s.id, t)}
              onRepsChange={(t) => onRepsChange(s.id, t)}
              onToggleDone={() => onToggleDone(s.id)}
              onDelete={onDeleteSet ? () => onDeleteSet(s.id) : undefined}
              isOpen={openSetId === s.id}
              onOpenChange={(o) => onSetOpenChange?.(s.id, o)}
              carryWeight={carry.weight}
              carryReps={carry.reps}
              active={active}
            />
          );
        })}
      </View>

      {/* + Add Set */}
      <Pressable
        onPress={onAddSet}
        onPressIn={() => setAddPressed(true)}
        onPressOut={() => setAddPressed(false)}
        style={[styles.addSet, addPressed && styles.addSetPressed]}
      >
        <Text style={[styles.addSetText, addPressed && styles.addSetTextPressed]}>+ Add Set</Text>
      </Pressable>
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
  addSetPressed: { borderColor: color.accent },
  addSetText: { fontFamily: font.titleSemi, fontSize: 12.5, color: color.text2 },
  addSetTextPressed: { color: color.accent },
});
