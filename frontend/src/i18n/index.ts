/**
 * The only i18n file that imports expo-localization. Import it once, early
 * (app/_layout.tsx), so the language is set before any screen renders.
 */
import { getLocales } from 'expo-localization';
import { Platform } from 'react-native';

import { setFontPlatform } from '../theme/fontForLang.ts';
import { setLang } from './current.ts';
import { resolveLang } from './locale.ts';

// Before setLang: Russian styles pick the system font for this platform.
setFontPlatform(Platform.OS === 'android' ? 'android' : 'ios');
const lang = resolveLang(getLocales().map((l) => l.languageTag));
setLang(lang);

export type { Lang } from './locale.ts';
export { getLang } from './current.ts';
export { t } from './t.ts';
