/**
 * A Pressable that scales down the instant it's pressed and springs back on
 * release — feedback on pointer-*down*, not touch-up (apple-design §1). Going
 * down is critically damped (instant, no wobble); the release carries a little
 * bounce, because a physical rebound should (§4).
 */
import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useThemed } from '../theme/ThemeProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  /** How far to scale while pressed (0.96 = subtle). */
  activeScale?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export function PressableScale({
  activeScale = 0.96,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  useThemed();
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animStyle]}
      onPressIn={(e) => {
        scale.value = withSpring(activeScale, { dampingRatio: 1, duration: 120 });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, { dampingRatio: 0.7, duration: 260 });
        onPressOut?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
