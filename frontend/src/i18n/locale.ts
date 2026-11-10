/** Maps OS locale tags to the app's languages. Pure: no native imports. */
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

/** The in-app Language setting (#136): System follows the phone, or one language. */
export type LangPref = 'system' | Lang;

/** The languages the setting offers, in the order it lists them. */
export const APP_LANGS: readonly Lang[] = ['en', 'zh-Hans', 'ru'];

/** Each language named in itself, so it can be found from any language. */
export const NATIVE_LANG_NAME: Readonly<Record<Lang, string>> = {
  en: 'English',
  'zh-Hans': '简体中文',
  ru: 'Русский',
};

/** A stored preference; anything unrecognised (or nothing) is System. */
export function parseLangPref(stored: string | null | undefined): LangPref {
  return (APP_LANGS as readonly string[]).includes(stored ?? '') ? (stored as Lang) : 'system';
}

/** The language the app shows: the chosen one, or System's rule on the phone's tags. */
export function effectiveLang(pref: LangPref, tags: readonly string[]): Lang {
  return pref === 'system' ? resolveLang(tags) : pref;
}
