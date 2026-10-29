/**
 * P6, #117: "Finish ‹First›'s workout first". Shown in place of the switcher
 * when a switch is refused because a workout is running (only one can run at
 * a time, across every profile), and after Add profile when the new
 * profile's switch is refused for the same reason. It names whose workout,
 * which, and for how long (ticking), and offers the way back to it. Discard
 * isn't offered: throwing away a client's session from a profile menu is one
 * tap too easy.
 * Source of truth: design-handoff/design_handoff_profiles/Profiles.dc.html, P6.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { finishFirstCopy } from '../domain/profiles';
import { DEFAULT_NAME } from '../lib/activeProfile';
import {
  dismissFinishWorkoutFirst,
  goToRunningWorkout,
  useFinishWorkoutFirst,
} from '../lib/finishWorkoutFirst';
import { textScale } from '../theme/textScale';
import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';
import { DraggableSheet } from './DraggableSheet';
import { PressableScale } from './PressableScale';

export function FinishWorkoutFirstSheet() {
  useThemed();
  const { request, visible } = useFinishWorkoutFirst();
  const [, setTick] = useState(0);

  // The running workout's clock ticks while the sheet is up.
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [visible]);

  // DraggableSheet stays mounted: one that mounts already visible never runs
  // its entrance, so it would stay below the screen.
  const copy = request
    ? finishFirstCopy({
        running: request.running,
        target: request.target,
        workoutName: request.workoutName,
        elapsedMs: Date.now() - request.startedAt,
        defaultName: DEFAULT_NAME,
      })
    : null;

  const onGo = () => {
    if (!request) return;
    dismissFinishWorkoutFirst();
    void goToRunningWorkout(request);
  };

  return (
    <DraggableSheet visible={visible} onClose={dismissFinishWorkoutFirst} sheetStyle={styles.sheet}>
      <View style={styles.grabber} />
      <Text style={styles.title} maxFontSizeMultiplier={textScale.display} accessibilityRole="header">
        {copy?.title}
      </Text>
      <Text style={styles.body}>
        {copy?.lead}
        <Text style={styles.elapsed}>{copy?.elapsed}</Text>
        {copy?.tail}
      </Text>
      <View style={styles.buttons}>
        <PressableScale onPress={onGo} style={styles.go} accessibilityRole="button" accessibilityLabel="Go to workout">
          <Text style={styles.goText} maxFontSizeMultiplier={textScale.control} numberOfLines={1}>
            Go to workout
          </Text>
        </PressableScale>
        <Pressable
          onPress={dismissFinishWorkoutFirst}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText} maxFontSizeMultiplier={textScale.control}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </DraggableSheet>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: color.border,
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 34,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.surface3,
      marginBottom: 18,
    },
    title: {
      fontFamily: font.displayBold,
      fontSize: 19,
      letterSpacing: -0.38,
      color: color.text1,
    },
    body: {
      fontFamily: font.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      color: color.text2,
      marginTop: 8,
    },
    elapsed: { fontFamily: font.monoRegular, color: color.text1, fontVariant: ['tabular-nums'] },
    buttons: { gap: 10, marginTop: 20 },
    go: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    goText: { fontFamily: font.displayBold, fontSize: 15, color: color.accentFg },
    cancel: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.75 },
    cancelText: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },
  }),
);
