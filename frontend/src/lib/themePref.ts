/**
 * The chosen accent palette (#72).
 *
 * SecureStore rather than the settings table: it is a device-local preference
 * like bodyweight and the warmup flag, and adding a column would mean a
 * migration for something that never syncs.
 */
import * as SecureStore from './secureStore';

import * as LiveActivity from '../../modules/live-activity';

import { DEFAULT_THEME_ID, paletteById, type ThemeId } from '../theme/palettes';

const KEY = 'ischys.themeId';

/** Never throws, and an unrecognised stored id falls back to the default. */
export async function getThemeId(): Promise<ThemeId> {
  try {
    return paletteById(await SecureStore.getItemAsync(KEY)).id;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export async function setThemeId(id: ThemeId): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, id);
    // The widget process cannot read the keychain, so the App Group carries the
    // accent across to the Live Activity card.
    LiveActivity.setThemeId(id);
  } catch {
    // Losing the preference costs one tap, not the app.
  }
}
