/**
 * The order of a profile switch, and what a failure leaves behind (#117).
 *
 * Pure, with every effect passed in, so `node --test` covers it
 * (switchSequence.test.ts); lib/switchProfile.ts wires it to the database,
 * SecureStore and the screen.
 *
 * The rule that shapes it: one profile's data must never be shown in, or
 * written into, another's. So a switch either completes or leaves the previous
 * profile exactly as it was: `db` on its file and it the active profile. To
 * make that possible, every step that can fail runs before the one that can't
 * be undone, closing the previous file: that is why `setActiveProfile` comes
 * before `closeConnection`. A file that won't close is left open (and logged);
 * the switch has already happened by then and stays correct.
 *
 * Preparing the target file and reading its settings never move `db` (Ruling
 * R9): the previous profile stays fully current until one synchronous stretch,
 * from `useConnection` to `bumpEpoch`, switches the connection, the active
 * profile, the caches and the screens together. Nothing in that stretch
 * awaits, so React renders once after it, by when the previous profile's tab
 * screens are gone: none of them renders with the new profile's settings.
 */
import { switchBlock } from '../domain/profiles.ts';

export type SwitchResult = 'ok' | 'same' | 'workout' | 'busy';

export type SwitchDeps<C, P extends { id: string; name: string }, S> = {
  currentProfile(): P;
  /** The profile a running workout belongs to, or null when none is running. */
  activeWorkoutProfileId(): Promise<string | null>;
  /** Whether an `atomically` transaction is open on the current connection. */
  transactionOpen(): boolean;
  /** Every profile, from the registry. */
  listProfiles(): Promise<P[]>;
  /** Caches the current file's workout stats in the registry. */
  refreshStats(): Promise<void>;
  currentConnection(): C;
  openConnection(id: string): C;
  /** Migrates and seeds `conn` without moving `db`. */
  prepareConnection(conn: C): Promise<void>;
  /** Reads `conn`'s settings without moving `db`. Never throws. */
  readSettings(conn: C): Promise<S>;
  useConnection(conn: C): void;
  /** Throws for the current connection; a no-op for the owner's. */
  closeConnection(conn: C): void;
  setActiveProfile(p: P, count: number): void;
  /** Drops every module's per-profile cache. Never throws. */
  runHooks(): void;
  /** Puts settings read by `readSettings` into the caches. Synchronous. */
  applySettings(settings: S): void;
  /** Best-effort upkeep of the new current file, once it is active. */
  tidy(): Promise<void>;
  /** Stores the profile to launch into next time. */
  rememberProfile(id: string): void;
  bumpEpoch(): void;
  haptic(): void;
  announce(text: string): void;
  warn?(message: string, error: unknown): void;
};

/** Makes the switch function. A second call while one is running is refused as `'busy'`. */
export function createSwitcher<C, P extends { id: string; name: string }, S>(
  d: SwitchDeps<C, P, S>,
): (targetId: string) => Promise<SwitchResult> {
  let switching = false;
  const warn = d.warn ?? (() => {});
  const quietly = (what: string, step: () => void) => {
    try {
      step();
    } catch (e) {
      warn(`[switchProfile] ${what} failed`, e);
    }
  };

  async function run(targetId: string): Promise<SwitchResult> {
    const fromProfile = d.currentProfile();
    // 1. Refuse what the switch must not cut across.
    const block = switchBlock({
      targetId,
      currentId: fromProfile.id,
      activeWorkoutProfileId: targetId === fromProfile.id ? null : await d.activeWorkoutProfileId(),
      transactionOpen: d.transactionOpen(),
    });
    if (block) return block;

    const rows = await d.listProfiles();
    const target = rows.find((p) => p.id === targetId);
    if (!target) throw new Error(`No profile ${targetId}`);

    // 2. The list shows each profile's stats without opening its file. A stale
    // count is better than no switch, so a failure here doesn't stop it.
    try {
      await d.refreshStats();
    } catch (e) {
      warn('[switchProfile] stats refresh failed', e);
    }

    // 3–5. Open and prepare the target file and read its settings, with `db`
    // still on the previous one; then enter it and make its profile the active
    // one. Until the previous file is closed, all of it can be undone.
    const from = d.currentConnection();
    let to: C | null = null;
    let settings: S;
    try {
      to = d.openConnection(targetId);
      await d.prepareConnection(to);
      settings = await d.readSettings(to);
      // Opened on the previous file meanwhile: a body still awaiting there
      // would follow `db` to the new one.
      if (d.transactionOpen()) {
        if (to !== from) d.closeConnection(to);
        return 'busy';
      }
      // From here to the epoch bump, nothing awaits.
      d.useConnection(to);
      d.setActiveProfile(target, rows.length);
    } catch (e) {
      if (d.currentConnection() !== from) d.useConnection(from);
      quietly('restoring the active profile', () => d.setActiveProfile(fromProfile, rows.length));
      if (to !== null && to !== from) quietly('closing the target file', () => d.closeConnection(to as C));
      throw e;
    }
    quietly('closing the previous file', () => d.closeConnection(from));

    // 6. Nothing from the previous profile is served from memory any more,
    // and the new profile's settings are in place before anything renders.
    d.runHooks();
    quietly('applying settings', () => d.applySettings(settings));
    // 7. Launch here next time.
    quietly('storing the active profile', () => d.rememberProfile(targetId));
    // 8. Every tab screen remounts with the new profile's data.
    d.bumpEpoch();
    // 9–10.
    quietly('haptic', () => d.haptic());
    quietly('announcement', () => d.announce(`Switched to ${target.name}`));
    // Upkeep that needs the profile active (bootstrap's tidyCurrentConnection).
    try {
      await d.tidy();
    } catch (e) {
      warn('[switchProfile] tidy failed', e);
    }
    return 'ok';
  }

  return async (targetId) => {
    if (switching) return 'busy';
    switching = true;
    try {
      return await run(targetId);
    } finally {
      switching = false;
    }
  };
}
