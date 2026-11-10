/** Plural categories and per-language rules. Pure: no native imports. */
import type { Lang } from './locale.ts';


export type PluralCategory = 'one' | 'few' | 'many' | 'other';

export function ruPlural(n: number): PluralCategory {
  if (!Number.isInteger(n)) return 'other';
  const a = Math.abs(n);
  const m10 = a % 10;
  const m100 = a % 100;
  if (m10 === 1 && m100 !== 11) return 'one';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
  return 'many';
}

/** Greek and Spanish: `one` only for exactly 1. */
export function oneOtherPlural(n: number): 'one' | 'other' {
  return n === 1 ? 'one' : 'other';
}

/** The plural rule for a language; null where the translator has no plural path (en, zh-Hans). */
export function pluralFor(lang: Lang): ((n: number) => PluralCategory) | null {
  if (lang === 'ru') return ruPlural;
  if (lang === 'el' || lang === 'es') return oneOtherPlural;
  return null;
}
