import { StyleSheet, Text, View } from 'react-native';

import type { WeekBar } from '../api/types';
import { color, font } from '../theme/tokens';

const MAX_BAR_PX = 68;

/** The 7-day volume bar chart at the foot of the weekly-summary card. */
export function WeekBars({ week }: { week: WeekBar[] }) {
  const max = Math.max(...week.map((d) => d.volume), 1);

  return (
    <View style={styles.row}>
      {week.map((d, i) => {
        const heightPx = Math.max(4, (d.volume / max) * MAX_BAR_PX);
        const barStyle =
          d.volume > 0
            ? { backgroundColor: color.accent }
            : d.today
              ? { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed' as const, borderColor: color.text3 }
              : { backgroundColor: color.surface3 };
        return (
          <View key={i} style={styles.col}>
            <View style={[styles.bar, { height: heightPx }, barStyle]} />
            <Text style={[styles.label, { color: d.today ? color.accent : color.text3 }]}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    height: 76,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: color.hair,
  },
  col: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 7,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    maxWidth: 26,
    borderRadius: 5,
  },
  label: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});
