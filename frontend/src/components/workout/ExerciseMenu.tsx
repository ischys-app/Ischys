/** Popover menu anchored under an exercise's "⋯" button. */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { ReorderIcon, SyncIcon, TrashIcon } from '../icons';

type Props = {
  /** Enter the full-screen reorder overlay. */
  onReorderStart: () => void;
  /** Swap this exercise for another, keeping its place in the list. */
  onReplace: () => void;
  onRemove: () => void;
};

export function ExerciseMenu({ onReorderStart, onReplace, onRemove }: Props) {
  return (
    <View style={styles.menu}>
      <Pressable
        onPress={onReorderStart}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        accessibilityRole="button"
        accessibilityLabel="Reorder exercises"
      >
        <ReorderIcon size={15} color={color.text1} strokeWidth={2.2} />
        <Text style={styles.itemText}>Reorder exercises</Text>
      </Pressable>

      <Pressable
        onPress={onReplace}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        accessibilityRole="button"
        accessibilityLabel="Replace exercise"
      >
        <SyncIcon size={15} color={color.text1} strokeWidth={2.2} />
        <Text style={styles.itemText}>Replace exercise</Text>
      </Pressable>

      <View style={styles.divider} />

      <Pressable
        onPress={onRemove}
        style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
        accessibilityRole="button"
        accessibilityLabel="Remove exercise"
      >
        <TrashIcon size={15} color={color.error} strokeWidth={2.2} />
        <Text style={[styles.itemText, styles.removeText]}>Remove exercise</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    top: 36,
    right: 0,
    zIndex: 45,
    width: 186,
    backgroundColor: color.surface3,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.82,
    shadowRadius: 36,
    elevation: 12,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 8,
  },
  itemPressed: { backgroundColor: color.surface2 },
  itemText: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: color.text1,
  },
  removeText: { color: color.error },
  divider: {
    height: 1,
    backgroundColor: color.hair,
    marginVertical: 4,
    marginHorizontal: 2,
  },
});
