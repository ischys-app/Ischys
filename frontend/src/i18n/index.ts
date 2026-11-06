/**
 * The only i18n file that imports expo-localization. Import it once, early
 * (app/_layout.tsx), so the language is set before any screen renders.
 */
import { getLocales } from 'expo-localization';

import { setLang } from './current.ts';
import { resolveLang } from './locale.ts';

export const lang = resolveLang(getLocales().map((l) => l.languageTag));
setLang(lang);

export type { Lang } from './locale.ts';
export { getLang } from './current.ts';
export { isZh, t } from './t.ts';
