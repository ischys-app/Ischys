import { StyleSheet, Text, View } from 'react-native';

import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';

/** "ISCHYS ● · ΙΣΧΥΣ" lockup with the accent dot, matching the design-system header. */
export function Wordmark() {
  useThemed();
  return (
    <View style={styles.row}>
      <Text style={styles.word}>ISCHYS</Text>
      <View style={styles.dot} />
      <Text style={[styles.word, styles.greek]}>· ΙΣΧΥΣ</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
    word: {
      fontFamily: font.monoMedium,
      fontSize: 12,
      letterSpacing: 2.6,
      color: color.text3,
    },
    greek: { marginLeft: 6 },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: color.accent,
      transform: [{ translateY: -1 }],
    },
  }),
);
