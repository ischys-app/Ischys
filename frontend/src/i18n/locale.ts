/** Maps OS locale tags to the app's app's languages. Pure: no native imports. */
export type Lang = 'en' | 'zh-Hans' | 'ru';

const TRADITIONAL_REGIONS = new Set(['TW', 'HK', 'MO']);

/** The first tag decides. Simplified Chinese -> zh-Hans; Russian -> ru; everything else (incl. Traditional) -> en. */
export function resolveLang(tags: readonly string[]): Lang {
  const first = tags[0];
  if (!first) return 'en';
  const parts = first.split(/[-_]/).map((p) => p.toLowerCase());
  if (parts[0] === 'ru') return 'ru';
  if (parts[0] !== 'zh') return 'en';
  const rest = parts.slice(1);
  if (rest.includes('hant')) return 'en';
  if (rest.includes('hans')) return 'zh-Hans';
  if (rest.some((p) => TRADITIONAL_REGIONS.has(p.toUpperCase()))) return 'en';
  return 'zh-Hans';
}
