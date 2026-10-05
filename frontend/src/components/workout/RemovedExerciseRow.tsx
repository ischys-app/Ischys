/**
 * What a removed exercise leaves behind while a finished workout is being
 * edited (board 13b, frames E9–E11): its card with the contents taken out,
 * in the same place, with Undo where Remove was tapped. Nothing is deleted
 * until Save.
 *
 * Presentational. Which rows exist, in what order, and what they say is
 * domain/workoutEdit.ts (`exerciseRows`).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { UndoIcon } from '../icons';

/**
 * The row's height as it is laid out: the 44pt button, 6pt of padding either
 * side of it, and the 1pt dashed border top and bottom. The edit screen's
 * scroll bookkeeping counts on this being exact.
 */
export const REMOVED_ROW_HEIGHT = 58;

type Props = {
  name: string;
  /** "REMOVED · 4 SETS". */
  label: string;
  /** "A2" while the exercise's superset still shows its rail. */
  tag?: string | null;
  onUndo: () => void;
};

export function RemovedExerciseRow({ name, label, tag, onUndo }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <View style={styles.nameRow}>
          {tag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ) : null}
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Pressable
        onPress={onUndo}
        style={({ pressed }) => [styles.undo, pressed && styles.undoPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Undo removing ${name}`}
      >
        <UndoIcon size={14} color={color.text1} strokeWidth={2.4} />
        <Text style={styles.undoText}>Undo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: REMOVED_ROW_HEIGHT,
    paddingVertical: 6,
    paddingRight: 6,
    paddingLeft: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
  },
  text: { flex: 1, minWidth: 0, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  tag: {
    flexShrink: 0,
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: color.surface3,
  },
  tagText: { fontFamily: font.monoSemi, fontSize: 10, color: color.text2 },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: color.text2,
    textDecorationLine: 'line-through',
    textDecorationColor: color.text3,
  },
  label: {
    fontFamily: font.monoRegular,
    fontSize: 10.5,
    letterSpacing: 0.84,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  undo: {
    flexShrink: 0,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  undoPressed: { borderColor: color.text3 },
  undoText: { fontFamily: font.titleSemi, fontSize: 13.5, color: color.text1 },
});
