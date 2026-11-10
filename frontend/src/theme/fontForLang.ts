/**
 * Space Grotesk has no Cyrillic, so in Russian the interface font is the
 * platform system font at the same weight: one font per line, never a mix of
 * Space Grotesk Latin and fallback Cyrillic. JetBrains Mono (data) has
 * Cyrillic and stays. English and Chinese are untouched.
 *
 * `themed()` (live.ts) runs every style set through `localizeFontStyles`, so
 * the `font.*` tokens keep their Space Grotesk names everywhere else.
 *
 * No React Native imports, so `node --test` covers it. The platform is
 * injected by src/i18n/index.ts (ios until then).
 */
import type { Lang } from '../i18n/locale.ts';
import { usesSystemFont } from '../i18n/scripts.ts';

export type FontPlatform = 'ios' | 'android';
export type FontWeight = '400' | '500' | '600' | '700';

/** The interface families (tokens.ts `font.*`) and the weight each one draws. */
const INTERFACE_WEIGHT: Readonly<Record<string, FontWeight>> = {
  SpaceGrotesk_700Bold: '700',
  SpaceGrotesk_600SemiBold: '600',
  SpaceGrotesk_500Medium: '500',
  SpaceGrotesk_400Regular: '400',
};

const SYSTEM_FAMILY: Record<FontPlatform, string> = { ios: 'System', android: 'sans-serif' };

let platform: FontPlatform = 'ios';

export function setFontPlatform(p: FontPlatform): void {
  platform = p;
}

export function fontPlatform(): FontPlatform {
  return platform;
}

/** The system font standing in for a Space Grotesk family; null for any other family. */
export function systemFontFor(
  family: string | undefined,
  p: FontPlatform,
): { fontFamily: string | undefined; fontWeight: FontWeight } | null {
  const weight = family === undefined ? undefined : INTERFACE_WEIGHT[family];
  return weight ? { fontFamily: SYSTEM_FAMILY[p], fontWeight: weight } : null;
}

function isPlain(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Copy-on-change walk: untouched branches keep their reference. */
function localize(v: unknown, p: FontPlatform): unknown {
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((item) => {
      const next = localize(item, p);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : v;
  }
  if (!isPlain(v)) return v;
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(v)) {
    const item = v[k];
    const next = localize(item, p);
    if (next !== item) (out ??= { ...v })[k] = next;
  }
  const sys = typeof v.fontFamily === 'string' ? systemFontFor(v.fontFamily, p) : null;
  if (sys) {
    out ??= { ...v };
    out.fontFamily = sys.fontFamily;
    // An explicit weight on the style wins.
    if (v.fontWeight === undefined) out.fontWeight = sys.fontWeight;
  }
  return out ?? v;
}

/**
 * For Russian and Greek, a copy of `styles` where every style with a Space Grotesk
 * family uses the system font at that weight. Any other language gets
 * `styles` itself back.
 */
export function localizeFontStyles<T>(styles: T, lang: Lang, p: FontPlatform = platform): T {
  if (!usesSystemFont(lang)) return styles;
  return localize(styles, p) as T;
}
