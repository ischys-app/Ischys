/**
 * Floating glass tab bar — the custom bottom bar from the Ischys design
 * (Home.dc.html): a blurred, translucent pill with an accent-tinted active tab.
 */
import { BlurView } from 'expo-blur';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { firstName } from '../domain/profiles';
import { PROFILES_ENABLED, useActiveProfile } from '../lib/activeProfile';
import { haptics } from '../lib/haptics';
import { openProfileSwitcher } from '../lib/profileSwitcherStore';
import { accentA, color, themed } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { HistoryIcon, HomeIcon, ProfileIcon } from './icons';
import { ProfileAvatar } from './ProfileAvatar';
import { useThemed } from '../theme/ThemeProvider';

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
  const scheme = useThemed();
  const insets = useSafeAreaInsets();
  const { profile, count } = useActiveProfile();
  // With 2+ profiles the Profile item shows whose data this is (P5). With one
  // it is exactly as before; only the long-press is there, unadvertised.
  const showWho = PROFILES_ENABLED && count > 1;
  const first = firstName(profile.name) || profile.name;

  return (
    <View style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 10 }]} pointerEvents="box-none">
      <BlurView intensity={26} tint={scheme} style={[styles.bar, Platform.OS === 'android' && styles.barAndroid]}>
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

          const isProfile = route.name === 'profile';
          const switcher = PROFILES_ENABLED && isProfile;
          const who = showWho && isProfile;

          const openSwitcher = () => {
            haptics.light();
            openProfileSwitcher();
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={switcher ? openSwitcher : undefined}
              delayLongPress={switcher ? 500 : undefined}
              accessibilityLabel={who ? `Profile, ${first}` : undefined}
              accessibilityActions={switcher ? [{ name: 'switch', label: 'Switch profile' }] : undefined}
              onAccessibilityAction={
                switcher
                  ? (e) => {
                      if (e.nativeEvent.actionName === 'switch') openProfileSwitcher();
                    }
                  : undefined
              }
              style={[styles.tab, focused && styles.tabActive, who && styles.tabWho]}
            >
              {who ? (
                <ProfileAvatar profile={profile} size={24} variant="outline" tint={tint} />
              ) : (
                <meta.Icon size={24} color={tint} strokeWidth={2} />
              )}
              <Text
                maxFontSizeMultiplier={textScale.fixed}
                numberOfLines={who ? 1 : undefined}
                style={[styles.label, { color: tint }, who && styles.labelWho]}
              >
                {who ? first : meta.label}
              </Text>
            </Pressable>
          );
        })}
      </BlurView>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, zIndex: 30 },
    // Android's BlurView does not blur, it only tints, so the list scrolling
    // underneath reads straight through the bar. Make it near-opaque there.
    barAndroid: { backgroundColor: color.chromeSolid },
    bar: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 4,
      padding: 6,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: color.chromeBorder,
      // drop shadow (iOS) + elevation (Android)
      shadowColor: '#000',
      shadowOpacity: 0.6,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 14 },
      elevation: 18,
    },
    tint: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: color.chromeTint },
    tab: {
      flex: 1,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 10,
    },
    tabActive: { backgroundColor: accentA(0.12) },
    // The avatar item (P5): a long first name ellipsises inside the tab. The
    // handoff's 6pt side inset sits on the label, not the tab: padding on a
    // `flex: 1` item widens its basis and the three tabs would differ.
    tabWho: { minWidth: 0 },
    label: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 10, letterSpacing: 0.1, lineHeight: 10 },
    labelWho: { maxWidth: '100%', paddingHorizontal: 6 },
  }),
);
