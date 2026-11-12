/**
 * The in-app Language setting (#136).
 *
 * SecureStore, like the theme: a device-local preference that is the same for
 * every profile. Read synchronously at launch (src/i18n/index.ts) so the first
 * screen already draws in the chosen language. A read that fails (the Keychain
 * before the first unlock after a restart) falls back to System for that launch.
 */
import * as SecureStore from './secureStore';

import { parseLangPref, type LangPref } from '../i18n/locale';

const KEY = 'ischys.lang';

export function readLangPref(): LangPref {
  try {
    return parseLangPref(SecureStore.getItem(KEY));
  } catch {
    return 'system';
  }
}

export async function saveLangPref(pref: LangPref): Promise<void> {
  try {
    if (pref === 'system') await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, pref);
  } catch {
    // Losing the preference costs one tap, not the app.
  }
}
