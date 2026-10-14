/**
 * Swipe-left-to-reveal-Delete wrapper for a list row.
 *
 * Extracted from `SetRow` so the routine editor's set rows get the identical
 * affordance rather than a second, differently-behaved one. The parent owns
 * "which row is open" (via `isOpen` + `onOpenChange`) so only one panel is ever
 * revealed at a time.
 *
 * Motion follows the apple-design skill: a gesture-handler pan tracks the finger
 * 1:1 (§2), rubber-bands past the bound (§9), decides open/close from release
 * *velocity* not just position (§6), and hands that velocity to an interruptible
 * spring so drag → snap has no seam (§5). A light haptic telegraphs the reveal (§13).
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { haptics } from '../../lib/haptics';
import { TrashIcon } from '../icons';
import { color, font, themed } from '../../theme/tokens';
import { useThemed } from '../../theme/ThemeProvider';

const OPEN_X = -72; // resting reveal
const MAX_X = -84; // hard bound before rubber-banding
const THRESHOLD = -40; // past here (by position) commits to open
const FLICK = 500; // px/s that decides direction regardless of position
// A touch of damping-ratio bounce; `response`-style duration. Velocity is added
// per-gesture at release.
const SPRING = { dampingRatio: 0.82, duration: 320 } as const;

type Props = {
  /** Fired by the swipe-revealed Delete button. Omitted → swipe disabled, no panel. */
  onDelete?: () => void;
  /** This row's swipe panel is revealed. */
  isOpen?: boolean;
  /** Notify the parent when this row opens/closes so it can keep a single open row. */
  onOpenChange?: (open: boolean) => void;
  accessibilityLabel: string;
  /** Corner radius of the clipping container — match the row's own radius. */
  radius: number;
  /** Style for the sliding foreground. Must be opaque: the panel sits behind it. */
  rowStyle: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function SwipeToDelete({
  onDelete,
  isOpen = false,
  onOpenChange,
  accessibilityLabel,
  radius,
  rowStyle,
  children,
}: Props) {
  useThemed();
  const swipeEnabled = !!onDelete;

  const tx = useSharedValue(isOpen ? OPEN_X : 0);
  const startX = useSharedValue(0); // tx at the moment the gesture begins
  const buzzed = useSharedValue(isOpen); // have we ticked for crossing the reveal?

  // React to the panel being opened/closed from outside (e.g. another row opened) —
  // spring it, never hard-cut, so an in-flight row can still be grabbed.
  useEffect(() => {
    tx.value = withSpring(isOpen ? OPEN_X : 0, SPRING);
    buzzed.value = isOpen;
  }, [isOpen, tx, buzzed]);

  const buzz = () => haptics.light();
  const notifyOpen = (open: boolean) => onOpenChange?.(open);

  const pan = Gesture.Pan()
    .enabled(swipeEnabled)
    .activeOffsetX([-8, 8]) // horizontal intent before we take the gesture
    .failOffsetY([-10, 10]) // let the parent ScrollView win on a vertical drag
    .onBegin(() => {
      'worklet';
      startX.value = tx.value; // respect where they grabbed it, not a reset
    })
    .onUpdate((e) => {
      'worklet';
      let nx = startX.value + e.translationX;
      if (nx > 0) nx = 0;
      if (nx < MAX_X) nx = MAX_X + (nx - MAX_X) * 0.15; // rubber-band past the bound
      tx.value = nx;
      // Telegraph the snap: one light tick as the reveal threshold is crossed.
      if (!buzzed.value && nx < THRESHOLD) {
        buzzed.value = true;
        runOnJS(buzz)();
      } else if (buzzed.value && nx > THRESHOLD) {
        buzzed.value = false;
      }
    })
    .onEnd((e) => {
      'worklet';
      // Velocity decides direction; position is the tie-breaker (§6).
      let open: boolean;
      if (e.velocityX < -FLICK) open = true;
      else if (e.velocityX > FLICK) open = false;
      else open = tx.value < THRESHOLD;
      tx.value = withSpring(open ? OPEN_X : 0, { ...SPRING, velocity: e.velocityX });
      runOnJS(notifyOpen)(open);
    });

  const foreground = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  const handleDelete = () => {
    haptics.commit();
    onDelete?.();
  };

  return (
    <View style={[styles.container, { borderRadius: radius }]}>
      {swipeEnabled && (
        <Pressable
          onPress={handleDelete}
          style={styles.deletePanel}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <TrashIcon size={16} color="#fff" strokeWidth={2} />
          <Text style={styles.deleteLabel}>Delete</Text>
        </Pressable>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={[rowStyle, foreground]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    container: {
      position: 'relative',
      overflow: 'hidden',
    },
    deletePanel: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      width: 76,
      backgroundColor: color.error,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    deleteLabel: {
      color: '#fff',
      fontFamily: font.titleSemi,
      fontSize: 11,
    },
  }),
);
