/**
 * Accent palettes (#72).
 *
 * A theme in Ischys is `accent` + `accentFg` and nothing else. Surfaces, text
 * and the status colours never change with it — the app's one rule is that
 * accent marks exactly one action per screen, and a theme that moved the greys
 * would be restyling the app rather than recolouring that one mark. Those move
 * with the appearance instead (light mode, 7b), which is a separate setting.
 *
 * Each palette carries a value per appearance. `accent`/`accentFg` are the dark
 * ones, and the only ones the Watch and the Live Activity ever use: both stay
 * black whatever the phone is set to.
 *
 * The contrast and hue rules the design set are enforced by the tests beside
 * this file, not by prose, so a future palette can't be added that quietly
 * fails them.
 */

export type ThemeId = 'ember' | 'volt' | 'ion' | 'chalk';

export type Palette = {
  id: ThemeId;
  name: string;
  accent: string;
  /** Text and icons drawn ON the accent. */
  accentFg: string;
  /** The same accent for light surfaces: darker, so it still reads on white. */
  light: { accent: string; accentFg: string };
  /**
   * Excused from the "30° from every status colour" rule, with a reason. Only
   * ember carries this: it predates the rule and ships anyway.
   */
  hueExempt?: true;
};

export const PALETTES: Palette[] = [
  // The original. 12° from `error`, which breaks the hue rule — kept because
  // error never fills a button: it appears as text and light tints only, so the
  // two never read as the same thing.
  {
    id: 'ember',
    name: 'Ember',
    accent: '#FF4A1C',
    accentFg: '#0B0B0C',
    light: { accent: '#D9380B', accentFg: '#FFFFFF' },
    hueExempt: true,
  },
  {
    id: 'volt',
    name: 'Volt',
    accent: '#C6F135',
    accentFg: '#0B0B0C',
    light: { accent: '#4E7A00', accentFg: '#FFFFFF' },
  },
  {
    id: 'ion',
    name: 'Ion',
    accent: '#C58BFF',
    accentFg: '#0B0B0C',
    light: { accent: '#7A3FD6', accentFg: '#FFFFFF' },
  },
  // Highest contrast of the four, and the same value as text1 — a primary
  // button stands out because it is filled, not because of its colour. On a
  // light surface "no hue" means ink, not white.
  {
    id: 'chalk',
    name: 'Chalk',
    accent: '#F4F4F5',
    accentFg: '#0B0B0C',
    light: { accent: '#0A0A0B', accentFg: '#FFFFFF' },
  },
];

export const DEFAULT_THEME_ID: ThemeId = 'ember';

/** Hue of each status colour, for the separation rule. */
export const STATUS_HUES = {
  success: 152, // #2DD881
  warning: 43, // #FFC24B
  error: 0, // #FF4D4D
  drop: 219, // #4C8DFF
} as const;

/** The accent pair a palette uses under an appearance. */
export function accentFor(p: Palette, scheme: 'dark' | 'light'): { accent: string; accentFg: string } {
  return scheme === 'light' ? p.light : { accent: p.accent, accentFg: p.accentFg };
}

/** Stored ids outlive builds, so anything unrecognised falls back to the default. */
export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * The accent at an opacity — the replacement for the 21 hardcoded
 * `rgba(255,74,28,…)` tints scattered through the app. Those were invisible to
 * theming: under Volt the tab pill would have stayed orange.
 */
export function accentAlpha(accent: string, alpha: number): string {
  const c = parseHex(accent) ?? parseHex(PALETTES[0].accent)!;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const c = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio, 1–21. Order of arguments doesn't matter. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hueOf(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Degrees between a colour's hue and another, the short way round (0–180). */
export function hueDistance(hex: string, hue: number): number {
  const diff = Math.abs(hueOf(hex) - hue) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** HSL saturation, 0–1. */
export function saturationOf(hex: string): number {
  const c = parseHex(hex);
  if (!c) return 0;
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

/**
 * Below this, a colour is effectively grey and its hue is numerical noise —
 * the difference between a few RGB steps, not something an eye reads as a hue.
 */
const ACHROMATIC_BELOW = 0.15;

/**
 * Whether an accent is safely distinguishable from every status colour.
 *
 * The rule is 30° of hue, but it only means anything for a colour that HAS a
 * hue. Chalk is near-white: it computes as 21° from the drop-set blue purely
 * because two of its channels differ by one step. Nobody mistakes white for
 * blue, so an achromatic accent passes — what would make it confusable is
 * chroma, and it has none.
 */
export function passesHueRule(accent: string): boolean {
  if (saturationOf(accent) < ACHROMATIC_BELOW) return true;
  return Object.values(STATUS_HUES).every((hue) => hueDistance(accent, hue) >= 30);
}
