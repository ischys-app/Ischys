import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../theme/tokens';
import { StarIcon } from './icons';

/** Green "N PR" pill with a star, shown on workout cards with personal records. */
export function PrPill({ count }: { count: number }) {
  return (
    <View style={styles.pill}>
      <StarIcon size={12} color={color.success} strokeWidth={2.4} />
      <Text style={styles.text}>{count} PR</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(45,216,129,0.10)',
  },
  text: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    color: color.success,
    fontVariant: ['tabular-nums'],
  },
});
