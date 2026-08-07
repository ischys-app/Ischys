/**
 * Swipe-left-to-reveal-Delete wrapper for a list row.
 *
 * Extracted from `SetRow` so the routine editor's set rows get the identical
 * affordance rather than a second, differently-behaved one. The parent owns
 * "which row is open" (via `isOpen` + `onOpenChange`) so only one panel is ever
 * revealed at a time.
 */
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TrashIcon } from '../icons';
import { color, font } from '../../theme/tokens';

// Matches the design's transform transition: cubic-bezier(0.22, 0.61, 0.36, 1), 220ms.
const SWIPE_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);
const SWIPE_DURATION = 220;
const OPEN_X = -72;
const MAX_X = -84;

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
  const swipeEnabled = !!onDelete;

  // Foreground translateX. Refs mirror the latest props so the PanResponder
  // (created once) never reads stale values.
  const tx = useRef(new Animated.Value(isOpen ? OPEN_X : 0)).current;
  const isOpenRef = useRef(isOpen);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const animateTo = (value: number) => {
    Animated.timing(tx, {
      toValue: value,
      duration: SWIPE_DURATION,
      easing: SWIPE_EASING,
      useNativeDriver: true,
    }).start();
  };

  // React to the panel being opened/closed from outside (e.g. another row opened).
  useEffect(() => {
    isOpenRef.current = isOpen;
    animateTo(isOpen ? OPEN_X : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pan = useRef(
    PanResponder.create({
      // 8px / axis-dominance gate — the RN equivalent of touch-action: pan-y, so
      // the parent ScrollView keeps vertical scrolling until the swipe is clearly horizontal.
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        const base = isOpenRef.current ? OPEN_X : 0;
        let nx = base + g.dx;
        if (nx > 0) nx = 0;
        if (nx < MAX_X) nx = MAX_X;
        tx.setValue(nx);
      },
      onPanResponderRelease: (_, g) => {
        const base = isOpenRef.current ? OPEN_X : 0;
        let nx = base + g.dx;
        if (nx > 0) nx = 0;
        if (nx < MAX_X) nx = MAX_X;
        const open = nx < -40;
        animateTo(open ? OPEN_X : 0);
        onOpenChangeRef.current?.(open);
      },
      onPanResponderTerminate: () => {
        animateTo(0);
        onOpenChangeRef.current?.(false);
      },
    }),
  ).current;

  const panHandlers = swipeEnabled ? pan.panHandlers : {};

  return (
    <View style={[styles.container, { borderRadius: radius }]}>
      {swipeEnabled && (
        <Pressable
          onPress={onDelete}
          style={styles.deletePanel}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <TrashIcon size={16} color="#fff" strokeWidth={2} />
          <Text style={styles.deleteLabel}>Delete</Text>
        </Pressable>
      )}

      <Animated.View {...panHandlers} style={[rowStyle, { transform: [{ translateX: tx }] }]}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
