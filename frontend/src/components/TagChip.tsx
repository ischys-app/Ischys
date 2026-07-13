import { StyleSheet, Text } from 'react-native';

import { color, font } from '../theme/tokens';

/** Muscle-group chip on a workout card. */
export function TagChip({ label }: { label: string }) {
  return <Text style={styles.chip}>{label}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 7,
    backgroundColor: color.surface2,
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text2,
    overflow: 'hidden',
  },
});
