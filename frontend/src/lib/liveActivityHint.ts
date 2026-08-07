/**
 * Remembers that we have already told the user their Live Activities are off.
 *
 * iOS turns the per-app switch off by itself once a card is dismissed, so a
 * workout can quietly have no Lock Screen card forever. Worth saying once — and
 * only once, because a nag at the start of every workout is worse than the bug.
 *
 * The flag is cleared whenever a card does start, so if the switch is ever
 * turned off again the next workout gets one fresh reminder.
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'ischys.liveActivityDisabledHintShown';

export function liveActivityHintShown(): boolean {
  try {
    return SecureStore.getItem(KEY) === '1';
  } catch {
    // Storage unavailable — treat as shown rather than risk repeating it.
    return true;
  }
}

export function rememberLiveActivityHint(): void {
  try {
    SecureStore.setItem(KEY, '1');
  } catch {
    // Losing the flag only costs one repeated hint.
  }
}

export function forgetLiveActivityHint(): void {
  try {
    SecureStore.deleteItemAsync(KEY).catch(() => {});
  } catch {
    // as above
  }
}
