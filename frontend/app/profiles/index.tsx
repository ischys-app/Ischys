/**
 * Placeholder for Manage profiles (P8) (#117). Task 11 replaces it. Unreachable while
 * PROFILES_ENABLED is off; it exists so the switcher's link typechecks.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, themed } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

export default function Placeholder() {
  useThemed();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Profiles</Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg, paddingHorizontal: 20 },
    title: { fontFamily: font.displayBold, fontSize: 26, letterSpacing: -0.52, color: color.text1 },
  }),
);
