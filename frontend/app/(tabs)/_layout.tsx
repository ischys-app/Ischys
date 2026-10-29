import { Tabs } from 'expo-router';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

import { TabBar } from '../../src/components/TabBar';
import { useActiveProfile } from '../../src/lib/activeProfile';
import { color } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

/** The fade the new profile's screens come in with (spec P7). */
const SWITCH_FADE_MS = 180;

/**
 * Fades the tabs in after a profile switch; instant with Reduce Motion on.
 * Runs before paint, so the remounted screens never show at full opacity first.
 */
function useSwitchFade(epoch: number): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(false);
  const shown = useRef(epoch);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) reduceMotion.current = on;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      reduceMotion.current = on;
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (shown.current === epoch) return;
    shown.current = epoch;
    if (reduceMotion.current) return;
    opacity.setValue(0);
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: SWITCH_FADE_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [epoch, opacity]);

  return opacity;
}

/**
 * Tabs render unconditionally — the pure on-device build has no auth gate.
 *
 * Keyed on the profile epoch (#117): a switch remounts every tab screen, so
 * none keeps the previous profile's data or scroll position.
 */
export default function TabsLayout() {
  useThemed();
  const { epoch } = useActiveProfile();
  const opacity = useSwitchFade(epoch);
  return (
    <Animated.View style={{ flex: 1, opacity, backgroundColor: color.bg }}>
      <Tabs
        key={epoch}
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.bg },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </Animated.View>
  );
}
