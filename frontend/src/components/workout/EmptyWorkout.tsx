/** Shown in the scroll area when the workout has no exercises. */
import { StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { DumbbellIcon } from '../icons';

export function EmptyWorkout() {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <DumbbellIcon size={28} color={color.accent} strokeWidth={2} />
      </View>
      <Text style={styles.title}>Empty workout</Text>
      <Text style={styles.sub}>
        Add your first exercise to start logging. Rest timers and previous-set references kick in
        automatically.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'column', alignItems: 'center', paddingTop: 54, paddingHorizontal: 16, paddingBottom: 14 },
  icon: {
    width: 62,
    height: 62,
    borderRadius: 17,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontFamily: font.displayBold, fontSize: 20, letterSpacing: -0.2, color: color.text1 },
  sub: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text2,
    lineHeight: 21,
    maxWidth: 260,
    marginTop: 8,
    textAlign: 'center',
  },
});
