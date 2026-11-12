/**
 * Exercise artwork — a short line-art loop of the movement.
 *
 * The frames are ordered positions (start → mid → end), cross-faded out and back
 * so the figure reads as one rep rather than a slideshow. Frames are stacked and
 * only their opacity animates, so there is no layout work per tick.
 *
 * Lists pass `animate={false}` to hold the first frame — a loop in every row
 * would pull focus mid-workout.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';

/** How long each frame is held before cross-fading to the next. */
const HOLD_MS = 900;
/** Cross-fade duration. Long enough to read as motion, short enough to feel deliberate. */
const FADE_MS = 260;

type Props = {
  /** Path `d` strings, in order. A single frame renders as a still. */
  frames: readonly string[];
  viewBox: string;
  size: number;
  /** Stroke/fill colour. Defaults to primary text so it sits on any dark surface. */
  tint?: string;
  /** Set false to hold the first frame (e.g. in a dense list). */
  animate?: boolean;
  style?: ViewStyle;
};

export function ExerciseArt({
  frames,
  viewBox,
  size,
  tint = color.text1,
  animate = true,
  style,
}: Props) {
  useThemed();
  // Deliberately NOT gated on Reduce Motion. This is a cross-dissolve between two
  // still drawings — nothing moves, scales, or parallaxes — and a cross-dissolve
  // is the substitution Apple recommends *for* Reduce Motion, so suppressing it
  // was both unnecessary and the reason the figure sat frozen on devices that
  // have the setting on. Callers that want a still pass `animate={false}`.
  const looping = animate && frames.length > 1;

  // One opacity per frame; frame 0 starts visible.
  const opacities = useRef<Animated.Value[]>([]);
  if (opacities.current.length !== frames.length) {
    opacities.current = frames.map((_, i) => new Animated.Value(i === 0 ? 1 : 0));
  }

  useEffect(() => {
    if (!looping) {
      // Snap back to the first frame when the loop is off.
      opacities.current.forEach((v, i) => v.setValue(i === 0 ? 1 : 0));
      return;
    }
    // Play the frames out and back — 0,1,2,1 — not 0,1,2,0. The frames are
    // positions through a rep (start, middle, end), so cycling straight from the
    // end back to the start snaps the figure through the movement backwards; a
    // squat teleports upright. Reversing through the middle reads as the rep
    // returning, which is what the movement actually does. Two frames alternate
    // naturally and need no reversal.
    const order =
      frames.length > 2
        ? [...frames.map((_, i) => i), ...frames.map((_, i) => i).slice(1, -1).reverse()]
        : frames.map((_, i) => i);

    let step = 0;
    const timer = setInterval(() => {
      const active = order[step % order.length];
      const next = order[(step + 1) % order.length];
      step += 1;
      if (next === active) return;
      Animated.parallel([
        Animated.timing(opacities.current[next], {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacities.current[active], {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }),
      ]).start();
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [looping, frames.length]);

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {frames.map((d, i) => (
        <Animated.View
          key={i}
          style={[StyleSheet.absoluteFill, { opacity: opacities.current[i] }]}
        >
          <Svg width={size} height={size} viewBox={viewBox}>
            <Path d={d} fill={tint} fillRule="evenodd" />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
}
