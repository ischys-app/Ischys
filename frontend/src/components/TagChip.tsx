import { StyleSheet, Text } from 'react-native';

import { color, font, themed } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { useThemed } from '../theme/ThemeProvider';

/** Muscle-group chip on a workout card. */
export function TagChip({ label }: { label: string }) {
  useThemed();
  return <Text maxFontSizeMultiplier={textScale.fixed} style={styles.chip}>{label}</Text>;
}

const styles = themed(() =>
  StyleSheet.create({
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
  }),
);
