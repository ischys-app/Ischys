/**
 * The display name shown on the Profile screen. There is no account, and iOS no
 * longer exposes the device owner's name to apps, so the user sets it themselves;
 * we keep it on-device in SecureStore. Unset (or cleared back to the default)
 * falls through to "Athlete".
 */
import * as SecureStore from 'expo-secure-store';

const KEY = 'ischys.profile.name';
export const DEFAULT_NAME = 'Athlete';

/** The user's name, or `DEFAULT_NAME` when unset. */
export async function getProfileName(): Promise<string> {
  const raw = (await SecureStore.getItemAsync(KEY))?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_NAME;
}

/** Persist the name; empty or the default clears the override. */
export async function setProfileName(name: string): Promise<void> {
  const v = name.trim();
  if (!v || v === DEFAULT_NAME) {
    await SecureStore.deleteItemAsync(KEY);
    return;
  }
  await SecureStore.setItemAsync(KEY, v);
}
