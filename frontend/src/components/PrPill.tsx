import { StyleSheet, Text, View } from 'react-native';

import { color, font, themed, withAlpha } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { StarIcon } from './icons';
import { useThemed } from '../theme/ThemeProvider';

/** Green "N PR" pill with a star, shown on workout cards with personal records. */
export function PrPill({ count }: { count: number }) {
  useThemed();
  return (
    <View style={styles.pill}>
      <StarIcon size={12} color={color.success} strokeWidth={2.4} />
      <Text maxFontSizeMultiplier={textScale.fixed} style={styles.text}>{count} PR</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 5,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: withAlpha(color.success, 0.10),
    },
    text: {
      fontFamily: font.monoSemi,
      fontSize: 11,
      color: color.success,
      fontVariant: ['tabular-nums'],
    },
  }),
);
