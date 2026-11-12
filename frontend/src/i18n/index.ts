/**
 * The only i18n file that imports expo-localization. Import it once, early
 * (app/_layout.tsx), so the language is set before any screen renders.
 *
 * The language is System's rule on the phone's languages unless the in-app
 * Language setting (#136) picked one. Changing it later goes through
 * `applyLangPref`, which ThemeProvider calls so every screen re-renders.
 */
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { readLangPref, saveLangPref } from '../lib/langPref';
import { setFontPlatform } from '../theme/fontForLang.ts';
import { setLang } from './current.ts';
import { effectiveLang, resolveLang, type Lang, type LangPref } from './locale.ts';

// Before setLang: Russian styles pick the system font for this platform.
setFontPlatform(Platform.OS === 'android' ? 'android' : 'ios');

const phoneTags = (): string[] => getLocales().map((l) => l.languageTag);

let pref: LangPref = readLangPref();
setLang(effectiveLang(pref, phoneTags()));

/** The stored setting: System, or the language picked in Settings. */
export function getLangPref(): LangPref {
  return pref;
}

/** What System shows on this phone right now. */
export function systemLang(): Lang {
  return resolveLang(phoneTags());
}

/** Switch the app's language and remember it. The caller re-renders. */
export function applyLangPref(next: LangPref): void {
  pref = next;
  setLang(effectiveLang(next, phoneTags()));
  void saveLangPref(next);
}

export type { Lang, LangPref } from './locale.ts';
export { APP_LANGS, NATIVE_LANG_NAME } from './locale.ts';
export { getLang } from './current.ts';
export { t } from './t.ts';
