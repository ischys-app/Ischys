/**
 * Resume-workout bar — the floating "Workout in progress" pill from the Ischys
 * design (Home.dc.html, RESUME WORKOUT BAR). A blurred, accent-tinted glass bar
 * pinned above the tab bar; its clock ticks every second while mounted.
 */
import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';

import { secondsSince } from '../lib/serverTime';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { color, font } from '../theme/tokens';
import { fmtClock } from './workout/types';

/**
 * The HTML pins this at `bottom: 104px` above a tab bar at `bottom: 22px` — a
 * 10dp gap. But TabBar lifts itself by the safe-area inset, so a fixed 104 tucks
 * under the tab bar on any device with a home indicator. Track it instead.
 */
const TAB_BAR_HEIGHT = 72;
const GAP_ABOVE_TAB_BAR = 10;

type Props = {
  name: string;
  /** ISO timestamp the workout started. The bar ticks its own clock. */
  startedAt: string;
  onPress: () => void;
};

/** Whole seconds elapsed since `startedAt`, clamped at >= 0. */
const elapsedSeconds = (startedAt: string): number => secondsSince(startedAt);

export function ResumeWorkoutBar({ name, startedAt, onPress }: Props) {
  const [seconds, setSeconds] = useState(() => elapsedSeconds(startedAt));
  const insets = useSafeAreaInsets();
  // Mirrors TabBar's own `Math.max(insets.bottom, 12) + 10`.
  const bottom = Math.max(insets.bottom, 12) + 10 + TAB_BAR_HEIGHT + GAP_ABOVE_TAB_BAR;

  useEffect(() => {
    setSeconds(elapsedSeconds(startedAt));
    const id = setInterval(() => setSeconds(elapsedSeconds(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <View style={[styles.shadow, { bottom }]} pointerEvents="box-none">
      <Pressable onPress={onPress}>
        <BlurView intensity={20} tint="dark" style={styles.clip}>
          <View style={styles.tint} />
          <View style={styles.row}>
            <View style={styles.halo}>
              <View style={styles.dot} />
            </View>
            <View style={styles.middle}>
              <Text style={styles.title}>Workout in progress</Text>
              <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                {name} · {fmtClock(seconds)}
              </Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillLabel}>Resume</Text>
              <Svg width={13} height={13} viewBox="0 0 24 24">
                <Path
                  d="M9 6l6 6-6 6"
                  fill="none"
                  stroke={color.accentFg}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
          </View>
        </BlurView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper carries the drop shadow (a clipped View cannot draw one).
  shadow: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 29,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.8,
    shadowRadius: 17,
    elevation: 12,
  },
  // Inner blur/clip layer.
  clip: {
    borderRadius: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,74,28,0.4)',
  },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,74,28,0.12)' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  // 4px accent halo ring around the live dot (box-shadow: 0 0 0 4px).
  halo: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    backgroundColor: 'rgba(255,74,28,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: color.accent },
  middle: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
    letterSpacing: -0.14,
  },
  subtitle: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text2,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 15,
    borderRadius: 9,
    backgroundColor: color.accent,
    flexShrink: 0,
  },
  pillLabel: {
    fontFamily: font.displayBold,
    fontSize: 13,
    color: color.accentFg,
  },
});
