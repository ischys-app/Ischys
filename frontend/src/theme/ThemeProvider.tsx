/**
 * Appearance and accent, live (#72, light mode 7b).
 *
 * Two independent settings: the appearance (Dark / Light / System) swaps the
 * surface, text and status tokens; the theme swaps only the accent. Both apply
 * at once, mid-workout included, by switching the live tokens (live.ts) and
 * re-rendering every component that subscribed with `useThemed()`.
 *
 * System is resolved with `useColorScheme()`, so the app follows the phone when
 * it flips at sunset. Dark and Light also set the native override, so alerts,
 * keyboards and pickers match the app rather than the phone.
 */
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Appearance, StyleSheet, useColorScheme, View } from 'react-native';

import type { Appearance as AppearancePref } from '../api/types';
import { getSettings, updateSettings } from '../api/workouts';
import { getThemeId, setThemeId as persistThemeId } from '../lib/themePref';
import { accentAlpha, paletteById, type Palette, type ThemeId } from './palettes';
import { activePalette, applyTheme, color, type Scheme } from './live';

/**
 * Light mode sits behind this until the Muscle Map heat ramp, the chart lines
 * and the set-type tints have had a light pass (7b, "not yet designed for
 * light"). Off, the app is dark whatever is stored and Settings hides the row.
 * On for TestFlight so it can be tried on a phone; turn off before a build
 * goes to App Review unless that pass has landed.
 */
export const LIGHT_MODE_ENABLED = true;

type ThemeValue = {
  /** What is showing: the setting, with System resolved. */
  scheme: Scheme;
  /** The stored setting. */
  appearance: AppearancePref;
  /** What the phone itself is set to, for "Following iPhone · Dark". */
  systemScheme: Scheme;
  palette: Palette;
  accent: string;
  accentFg: string;
  /** The accent at an opacity, for tints and glows. */
  accentA: (alpha: number) => string;
  setAppearance: (next: AppearancePref) => void;
  setTheme: (id: ThemeId) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/** How long the colour change takes to fade in. */
const FADE_MS = 250;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearancePref | null>(null);
  const [themeId, setThemeIdState] = useState<ThemeId>(activePalette().id);
  // Under a forced override this reports the override, not the phone. It is
  // only shown while System is selected, when there is no override.
  const systemScheme: Scheme = useColorScheme() === 'light' ? 'light' : 'dark';

  useEffect(() => {
    let alive = true;
    void getSettings()
      .then((s) => s.appearance)
      .catch((): AppearancePref => 'dark')
      .then((a) => {
        if (alive) setAppearanceState(a);
      });
    void getThemeId().then((id) => {
      if (alive) setThemeIdState(id);
    });
    return () => {
      alive = false;
    };
  }, []);

  const effective: AppearancePref = LIGHT_MODE_ENABLED ? (appearance ?? 'dark') : 'dark';
  const scheme: Scheme = effective === 'system' ? systemScheme : effective;
  const palette = paletteById(themeId);

  // During render, not in an effect: every child reads the live tokens in this
  // same pass, so they have to be switched before any of them renders.
  applyTheme(scheme, palette);

  useLayoutEffect(() => {
    Appearance.setColorScheme(effective === 'system' ? 'unspecified' : effective);
  }, [effective]);

  const value = useMemo<ThemeValue>(
    () => ({
      scheme,
      appearance: appearance ?? 'dark',
      systemScheme,
      palette,
      accent: color.accent,
      accentFg: color.accentFg,
      accentA: (alpha: number) => accentAlpha(color.accent, alpha),
      setAppearance: (next) => {
        setAppearanceState(next);
        void updateSettings({ appearance: next }).catch(() => {});
      },
      setTheme: (next) => {
        setThemeIdState(next);
        void persistThemeId(next);
      },
    }),
    // `palette` is derived from themeId; listing the id keeps the memo stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, appearance, systemScheme, themeId],
  );

  // Hold the first frame until the stored appearance is known, so a light user
  // never sees a dark flash on launch. The DB is already open by now.
  if (appearance === null) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {children}
      <SchemeFade scheme={scheme} />
    </ThemeContext.Provider>
  );
}

/**
 * Softens the switch: a sheet of the old background over the new colours,
 * faded out. Never takes touches.
 */
function SchemeFade({ scheme }: { scheme: Scheme }) {
  const prev = useRef(scheme);
  const [from, setFrom] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (prev.current === scheme) return;
    prev.current = scheme;
    // The background being left behind: the other scheme's bg.
    setFrom(scheme === 'light' ? '#0A0A0B' : '#F4F4F5');
    opacity.setValue(1);
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
      setFrom(null),
    );
  }, [scheme, opacity]);

  if (from === null) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: from, opacity }]}
    />
  );
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme outside ThemeProvider');
  return v;
}

/**
 * Re-render this component when the appearance or accent changes. Any
 * component that reads `color`, `accentA` or a `themed()` style calls it; the
 * values themselves come from those, live.
 */
export function useThemed(): Scheme {
  return useContext(ThemeContext)?.scheme ?? 'dark';
}
