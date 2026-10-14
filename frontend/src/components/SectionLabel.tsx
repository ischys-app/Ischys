import { StyleSheet, Text, TextStyle } from 'react-native';

import { color, font, themed } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { useThemed } from '../theme/ThemeProvider';

/** Mono section eyebrow: e.g. QUICK START, MY ROUTINES, RECENT. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  useThemed();
  return <Text maxFontSizeMultiplier={textScale.control} style={[styles.label, style]}>{children}</Text>;
}

const styles = themed(() =>
  StyleSheet.create({
    label: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 1.54,
      color: color.text3,
      textTransform: 'uppercase',
    },
  }),
);
