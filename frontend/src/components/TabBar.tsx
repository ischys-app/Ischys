/**
 * Floating glass tab bar — the custom bottom bar from the Ischys design
 * (Home.dc.html): a blurred, translucent pill with an accent-tinted active tab.
 */
import { BlurView } from 'expo-blur';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color } from '../theme/tokens';
import { HistoryIcon, HomeIcon, ProfileIcon } from './icons';

/** Minimal shape of the navigation tabBar props we consume. */
type TabBarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
};

const TABS: Record<string, { label: string; Icon: typeof HomeIcon }> = {
  index: { label: 'Home', Icon: HomeIcon },
  history: { label: 'History', Icon: HistoryIcon },
  profile: { label: 'Profile', Icon: ProfileIcon },
};

export function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 10 }]} pointerEvents="box-none">
      <BlurView intensity={26} tint="dark" style={styles.bar}>
        <View style={styles.tint} />
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const tint = focused ? color.accent : color.text2;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <meta.Icon size={24} color={tint} strokeWidth={2} />
              <Text style={[styles.label, { color: tint }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
  bar: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    padding: 6,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    // drop shadow (iOS) + elevation (Android)
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30,30,36,0.55)' },
  tab: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  tabActive: { backgroundColor: 'rgba(255,74,28,0.12)' },
  label: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10, letterSpacing: 0.1, lineHeight: 10 },
});
