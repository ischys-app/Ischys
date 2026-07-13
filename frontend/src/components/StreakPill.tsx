import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme/tokens';

/** Green streak pill shown in the weekly-summary row. */
export function StreakPill({ days }: { days: number }) {
  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text style={styles.text}>{days}-day streak</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(45,216,129,0.10)',
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.success },
  text: {
    fontFamily: font.monoSemi,
    fontSize: 12,
    color: color.success,
    fontVariant: ['tabular-nums'],
  },
});
