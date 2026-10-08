/**
 * A bottom sheet you can throw away.
 *
 * RN's `<Modal animationType="slide">` is a fixed, non-interruptible slide with
 * tap-only dismiss. This drives the motion with a gesture-handler pan + a
 * Reanimated spring, so the sheet tracks the finger 1:1, dismisses on a downward
 * flick's *velocity* (not just distance), springs back — from wherever it is —
 * if you don't throw it far enough, and dims the backdrop in proportion to the
 * drag. apple-design §3 (interruptible), §5 (velocity), §6 (momentum), §9
 * (rubber-band), §12 (dim to focus).
 */
import type { ReactNode } from 'react';
import { Children, useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '../lib/haptics';
import { useNavigationBarInset } from './AboveNavigationBar';

const SCREEN_H = Dimensions.get('window').height;
const SPRING = { dampingRatio: 0.82, duration: 340 } as const;
const DISMISS_VELOCITY = 800; // px/s downward flick that dismisses regardless of distance
const DISMISS_FRACTION = 0.3; // or dragged past 30% of the sheet's height

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Style for the sheet surface (background, radius, maxHeight, shadow). */
  sheetStyle?: StyleProp<ViewStyle>;
  /**
   * When the sheet contains its own scroll view, a whole-sheet pan fights the
   * scroll. Set this to attach the pan to only the *first* child (the grabber +
   * header "grab handle") — the remaining children then scroll freely.
   */
  handleOnly?: boolean;
};

export function DraggableSheet({ visible, onClose, children, sheetStyle, handleOnly }: Props) {
  // Stay mounted through the exit animation.
  const [rendered, setRendered] = useState(visible);

  const ty = useSharedValue(SCREEN_H); // sheet offset; SCREEN_H = fully hidden below
  const sheetH = useSharedValue(SCREEN_H); // measured height (for the fade + threshold)
  const startY = useSharedValue(0);
  const needsEntrance = useSharedValue(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      needsEntrance.value = true; // the entrance spring runs once we know the height (onLayout)
    } else if (rendered) {
      ty.value = withTiming(sheetH.value || SCREEN_H, { duration: 220 }, (done) => {
        if (done) runOnJS(setRendered)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const buzz = () => haptics.light();

  const pan = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      startY.value = ty.value; // respect where they grabbed it (interruptible mid-flight)
    })
    .onUpdate((e) => {
      'worklet';
      let y = startY.value + e.translationY;
      if (y < 0) y = y * 0.15; // rubber-band upward past the top
      ty.value = y;
    })
    .onEnd((e) => {
      'worklet';
      const dismiss = ty.value > sheetH.value * DISMISS_FRACTION || e.velocityY > DISMISS_VELOCITY;
      if (dismiss) {
        ty.value = withTiming(sheetH.value, { duration: 200 }, (done) => {
          if (done) runOnJS(setRendered)(false);
        });
        runOnJS(buzz)();
        runOnJS(onClose)();
      } else {
        ty.value = withSpring(0, { ...SPRING, velocity: e.velocityY });
      }
    });

  const navigationBar = useNavigationBarInset();
  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const backdropAnim = useAnimatedStyle(() => {
    const h = sheetH.value || SCREEN_H;
    return { opacity: 1 - Math.min(1, Math.max(0, ty.value / h)) };
  });

  if (!rendered) return null;

  const onSheetLayout = (ev: { nativeEvent: { layout: { height: number } } }) => {
    const h = ev.nativeEvent.layout.height;
    sheetH.value = h;
    if (needsEntrance.value) {
      needsEntrance.value = false;
      ty.value = h; // start exactly one sheet-height below (off-screen)
      ty.value = withSpring(0, SPRING); // slide up
    }
  };

  // handleOnly: pan only the first child (grabber + header) so a nested
  // ScrollView in the remaining children keeps scrolling normally.
  const kids = Children.toArray(children);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* The Modal is its own edge-to-edge window on Android, so the sheet is
          lifted clear of the navigation bar here and clipped as it leaves. */}
      <View style={[styles.root, { marginBottom: navigationBar, overflow: 'hidden' }]}>
        <Animated.View style={[styles.backdrop, backdropAnim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        {handleOnly ? (
          <Animated.View style={[sheetStyle, sheetAnim]} onLayout={onSheetLayout}>
            <GestureDetector gesture={pan}>
              <View>{kids[0]}</View>
            </GestureDetector>
            {kids.slice(1)}
          </Animated.View>
        ) : (
          <GestureDetector gesture={pan}>
            <Animated.View style={[sheetStyle, sheetAnim]} onLayout={onSheetLayout}>
              {children}
            </Animated.View>
          </GestureDetector>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
