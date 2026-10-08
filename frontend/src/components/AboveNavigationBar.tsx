/**
 * Keeps the whole app above Android's navigation bar.
 *
 * Android draws edge-to-edge, so the three-button bar sits on top of whatever
 * reaches the bottom of the window. The layouts were spaced for the iPhone home
 * indicator, mostly with fixed paddings, which leaves bottom bars and buttons
 * underneath it. Rather than thread an inset through every one of them, the
 * root is padded once and the bottom inset reported to the screens becomes 0.
 *
 * A `<Modal>` is a window of its own and is not covered by that padding, so it
 * reads the real inset from `useNavigationBarInset`.
 *
 * iOS is untouched: this renders its children as they are.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { color } from '../theme/tokens';

const NavigationBarInsetContext = createContext(0);

/** Height of Android's navigation bar; 0 on iOS. */
export function useNavigationBarInset(): number {
  return useContext(NavigationBarInsetContext);
}

export function AboveNavigationBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { top, left, right, bottom } = insets;
  const screenInsets = useMemo(() => ({ top, left, right, bottom: 0 }), [top, left, right]);

  if (Platform.OS !== 'android') return <>{children}</>;

  return (
    <NavigationBarInsetContext.Provider value={bottom}>
      <View style={{ flex: 1, backgroundColor: color.bg, paddingBottom: bottom }}>
        <SafeAreaInsetsContext.Provider value={screenInsets}>{children}</SafeAreaInsetsContext.Provider>
      </View>
    </NavigationBarInsetContext.Provider>
  );
}
