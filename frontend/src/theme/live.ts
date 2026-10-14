/**
 * Live colour tokens (light mode, 7b).
 *
 * Every screen builds its styles at import time, so before light mode a colour
 * was fixed for the life of the process. Appearance has to change while the app
 * runs — from Settings, and when iOS flips between light and dark at sunset —
 * so the values now live here and are read at render time instead:
 *
 * - `color` is an object of getters onto the active token set. Code that reads
 *   `color.text2` while rendering gets the current value.
 * - `themed(factory)` stands in for a module-level `StyleSheet.create(...)`. It
 *   builds the styles once per appearance + palette and hands out whichever set
 *   is active, so `styles.row` keeps working unchanged at every call site.
 *
 * Neither re-renders anything by itself. A component re-renders on a change by
 * calling `useThemed()` (ThemeProvider.tsx), which every component that reads a
 * colour does.
 *
 * No React Native imports, so `node --test` covers it. See live.test.ts.
 */
import { accentFor, paletteById, type Palette } from './palettes.ts';

export type Scheme = 'dark' | 'light';

const DARK = {
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
  success: '#2DD881', // PR, target hit
  warning: '#FFC24B', // deload, missed
  error: '#FF4D4D', // failed lift, delete
  // set-type accents
  warmup: '#FFC24B',
  drop: '#4C8DFF',
  failure: '#FF4D4D',
  /** Translucent bars that content scrolls under. */
  headerBg: 'rgba(10,10,11,0.9)',
  /** The selected segment of a segmented control. */
  segSel: '#212127',
  /** Floating blurred bars (tab bar, resume bar): the wash over the blur, its
   * edge, and the solid base Android needs because its blur only tints. */
  chromeTint: 'rgba(30,30,36,0.55)',
  chromeBorder: 'rgba(255,255,255,0.09)',
  chromeSolid: 'rgba(20,20,23,0.97)',
};

type SchemeTokens = typeof DARK;

/**
 * Light values, from the 7b board. Status colours are darker so PR green and
 * error red still read as text on white. The set-row pair isn't on the board:
 * like dark, done sits between surface2 and surface3 and the next set up
 * between surface1 and surface2.
 */
const LIGHT: SchemeTokens = {
  bg: '#F4F4F5',
  surface1: '#FFFFFF',
  surface2: '#EBEBEE',
  surface3: '#E1E1E6',
  setRowDone: '#E6E6EA',
  setRowActive: '#F5F5F7',
  border: '#D6D6DC',
  hair: '#E7E7EA',
  text1: '#0A0A0B',
  text2: '#55555D',
  text3: '#6E6E76',
  success: '#0B7F43',
  warning: '#9A6200',
  error: '#D12A2A',
  warmup: '#9A6200',
  drop: '#2F67D8',
  failure: '#D12A2A',
  headerBg: 'rgba(244,244,245,0.88)',
  segSel: '#FFFFFF',
  // Not on the 7b board: white glass with an ink hairline, the light mirror of
  // the dark values above.
  chromeTint: 'rgba(255,255,255,0.6)',
  chromeBorder: 'rgba(10,10,11,0.08)',
  chromeSolid: 'rgba(255,255,255,0.97)',
};

export type Tokens = SchemeTokens & {
  accent: string; // THE action color (complete a set) — reserve it
  accentFg: string; // text/icon on accent
};

export function tokensFor(scheme: Scheme, palette: Palette): Tokens {
  return { ...(scheme === 'light' ? LIGHT : DARK), ...accentFor(palette, scheme) };
}

let scheme: Scheme = 'dark';
let palette: Palette = paletteById(null);
let active: Tokens = tokensFor(scheme, palette);
let key = `${scheme}:${palette.id}`;

/**
 * Switch the active tokens. Idempotent, so ThemeProvider can call it while
 * rendering: it must land before any child reads a colour in the same pass.
 */
export function applyTheme(nextScheme: Scheme, nextPalette: Palette): void {
  const nextKey = `${nextScheme}:${nextPalette.id}`;
  if (nextKey === key) return;
  scheme = nextScheme;
  palette = nextPalette;
  active = tokensFor(scheme, palette);
  key = nextKey;
}

export function activeScheme(): Scheme {
  return scheme;
}

/** A one-off value that isn't a token, picked for the active appearance. */
export function byScheme<T>(dark: T, light: T): T {
  return scheme === 'light' ? light : dark;
}

export function activePalette(): Palette {
  return palette;
}

export const color: Readonly<Tokens> = Object.defineProperties(
  {},
  Object.fromEntries(
    Object.keys(tokensFor('dark', palette)).map((k) => [
      k,
      { enumerable: true, get: () => active[k as keyof Tokens] },
    ]),
  ),
) as Tokens;

/**
 * A value built from colours, rebuilt per appearance + palette and cached. Pass
 * it what you would have assigned at module level:
 *
 *   const styles = themed(() => StyleSheet.create({ ... }));
 *
 * The proxy forwards every read to the set for the active theme. Its target is
 * a blank stand-in, never a built set: React Native freezes styles in dev, and
 * a proxy may not report a frozen target's property as anything but its value.
 */
export function themed<T extends object>(factory: () => T): T {
  const cache = new Map<string, T>();
  const current = (): T => {
    let v = cache.get(key);
    if (v === undefined) {
      v = factory();
      cache.set(key, v);
    }
    return v;
  };
  return new Proxy((Array.isArray(current()) ? [] : {}) as T, {
    get: (_t, p) => {
      const v = current();
      const out = Reflect.get(v, p, v);
      // Array methods called through the proxy must run on the real array.
      return typeof out === 'function' && Array.isArray(v) ? out.bind(v) : out;
    },
    has: (_t, p) => Reflect.has(current(), p),
    ownKeys: () => Reflect.ownKeys(current()),
    getOwnPropertyDescriptor: (_t, p) => {
      const d = Reflect.getOwnPropertyDescriptor(current(), p);
      return d && { ...d, configurable: true };
    },
  });
}
