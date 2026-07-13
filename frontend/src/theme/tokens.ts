/**
 * Ischys design tokens — verbatim from the Design System export (:root vars).
 * The React Native equivalent of the web design tokens. See the
 * ischys-design-handoff skill for the source-of-truth mapping.
 */
import type { TextStyle } from 'react-native';

export const color = {
  bg: '#0A0A0B', // base
  surface1: '#111113',
  surface2: '#17171A',
  surface3: '#212127',
  /** Set-row backgrounds (Active Workout): completed, and the next set up. */
  setRowDone: '#191920',
  setRowActive: '#151519',
  border: '#26262C',
  hair: '#1D1D22', // subtle divider
  text1: '#F4F4F5', // primary
  text2: '#97979E', // secondary
  text3: '#5B5B63', // tertiary
  accent: '#FF4A1C', // THE action color (complete a set) — reserve it
  accentFg: '#0B0B0C', // text/icon on accent
  success: '#2DD881', // PR, target hit
  warning: '#FFC24B', // deload, missed
  error: '#FF4D4D', // failed lift, delete
  // set-type accents
  warmup: '#FFC24B',
  drop: '#4C8DFF',
  failure: '#FF4D4D',
} as const;

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
