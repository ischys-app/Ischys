import { StyleSheet, Text, TextStyle } from 'react-native';

import { color, font } from '../theme/tokens';

/** Mono section eyebrow: e.g. QUICK START, MY ROUTINES, RECENT. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    textTransform: 'uppercase',
  },
});
