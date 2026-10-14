import { StyleSheet, Text, View } from 'react-native';

import { color, font, themed, withAlpha } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { useThemed } from '../theme/ThemeProvider';

/** Green streak pill shown in the weekly-summary row. */
export function StreakPill({ days }: { days: number }) {
  useThemed();
  return (
    <View style={styles.pill}>
      <View style={styles.dot} />
      <Text maxFontSizeMultiplier={textScale.fixed} style={styles.text}>{days}-day streak</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 999,
      backgroundColor: withAlpha(color.success, 0.10),
    },
    dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.success },
    text: {
      fontFamily: font.monoSemi,
      fontSize: 12,
      color: color.success,
      fontVariant: ['tabular-nums'],
    },
  }),
);
