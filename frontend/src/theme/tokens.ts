/**
 * Ischys design tokens — verbatim from the Design System export (:root vars).
 * The React Native equivalent of the web design tokens. See the
 * ischys-design-handoff skill for the source-of-truth mapping.
 */
import type { TextStyle } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { accentAlpha, paletteById } from './palettes';
import { activePalette, activeScheme, applyTheme, color } from './live';

export { byScheme, color, themed, type Scheme, type Tokens } from './live';

/**
 * The stored accent, applied SYNCHRONOUSLY at module load (#72) so the first
 * frame already has it. Colours are live now (live.ts), so ThemeProvider can
 * change palette and appearance later without a relaunch; this only spares the
 * first frame a flash of the default accent.
 */
function storedPalette() {
  try {
    return paletteById(SecureStore.getItem('ischys.themeId'));
  } catch {
    // Storage unavailable this early — the default accent is a fine answer.
    return paletteById(null);
  }
}

applyTheme(activeScheme(), storedPalette());

/** 4px base grid. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  pill: 999,
} as const;

/**
 * Space Grotesk = interface; JetBrains Mono = ALL data (weights, reps, timers,
 * dates) with tabular figures so digits never shift.
 */
export const font = {
  // interface (Space Grotesk)
  displayBold: 'SpaceGrotesk_700Bold',
  titleSemi: 'SpaceGrotesk_600SemiBold',
  bodyMedium: 'SpaceGrotesk_500Medium',
  bodyRegular: 'SpaceGrotesk_400Regular',
  // data (JetBrains Mono)
  monoRegular: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemi: 'JetBrainsMono_600SemiBold',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

/** Type scale from the Design System (family / size / weight). */
const tabular: TextStyle['fontVariant'] = ['tabular-nums'];
export const type = {
  display: { fontFamily: font.displayBold, fontSize: 44 },
  title: { fontFamily: font.titleSemi, fontSize: 30 },
  heading: { fontFamily: font.titleSemi, fontSize: 20 },
  body: { fontFamily: font.bodyRegular, fontSize: 16 },
  label: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.5 }, // SET · PREV · KG · REPS
  data: { fontFamily: font.monoMedium, fontSize: 28, fontVariant: tabular }, // 82.5 × 8
} satisfies Record<string, TextStyle>;

/** Minimum thumb-safe tap target (Design System principle). */
export const TAP_TARGET = 44;

/**
 * The current accent at an opacity — the replacement for the hardcoded
 * `rgba(255,74,28,…)` tints, which theming could not see. Without this the tab
 * pill would stay orange under any other palette.
 */
export function accentA(alpha: number): string {
  return accentAlpha(color.accent, alpha);
}

/**
 * Any token at an opacity, for the status tints (`withAlpha(color.success,
 * 0.1)`) that were hardcoded to the dark values.
 */
export function withAlpha(hex: string, alpha: number): string {
  return accentAlpha(hex, alpha);
}

/** For code outside React that needs to know which palette is showing. */
export { activePalette, activeScheme };
