/**
 * What the deload advisory remembers between sessions (#70).
 *
 * The advisory's whole design is restraint — one card per fortnight, six weeks
 * of silence after a dismissal — and none of that works without memory of what
 * was already shown. Kept in SecureStore beside the other device-local
 * preferences: it describes this person's relationship with the prompt, not
 * their training, so it never syncs and belongs in no table.
 *
 * Accepting a deload stores a window, not weights. Nothing is ever written to a
 * set: `domain/progression` reads the window and suggests lighter numbers while
 * it is open, and the user remains free to ignore every one of them.
 */
import * as SecureStore from 'expo-secure-store';

import { profileKey } from './activeProfile';

const KEY = 'ischys.deloadState';

export type DeloadState = {
  /** When a card was last shown, for the once-per-fortnight cap. */
  lastShownAt: number | null;
  /** exerciseId -> when it was dismissed, for the six-week silence. */
  dismissed: Record<string, number>;
  /** exerciseId -> epoch ms the accepted deload stops applying. */
  activeUntil: Record<string, number>;
  /** Master switch from Settings. */
  enabled: boolean;
};

const EMPTY: DeloadState = { lastShownAt: null, dismissed: {}, activeUntil: {}, enabled: true };

/** Never throws: a lost preference costs restraint, not the workout. */
export async function getDeloadState(): Promise<DeloadState> {
  try {
    const raw = await SecureStore.getItemAsync(profileKey(KEY));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<DeloadState>;
    return {
      lastShownAt: typeof parsed.lastShownAt === 'number' ? parsed.lastShownAt : null,
      dismissed: parsed.dismissed ?? {},
      activeUntil: parsed.activeUntil ?? {},
      enabled: parsed.enabled !== false,
    };
  } catch {
    return EMPTY;
  }
}

export async function setDeloadState(next: DeloadState): Promise<void> {
  try {
    await SecureStore.setItemAsync(profileKey(KEY), JSON.stringify(next));
  } catch {
    // as above
  }
}

/** True while an accepted deload is still running for this exercise. */
export function deloadActiveFor(state: DeloadState, exerciseId: string, now = Date.now()): boolean {
  const until = state.activeUntil[exerciseId];
  return typeof until === 'number' && until > now;
}
