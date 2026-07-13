import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme/tokens';

/** A single stat cell in the 2×2 weekly-summary grid. */
export function StatTile({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: { flexDirection: 'column', gap: 3 },
  label: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.0,
    color: color.text3,
    textTransform: 'uppercase',
  },
  value: {
    fontFamily: font.monoSemi,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    letterSpacing: 0,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
});
