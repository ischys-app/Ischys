/**
 * The order of deleting a profile (P8b, #117), and what a failure leaves.
 *
 * Pure, with every effect passed in, so `node --test` covers it
 * (deleteProfileSequence.test.ts); src/lib/deleteProfile.ts wires it to the
 * registry, the switch, the files and SecureStore.
 *
 * The order:
 *   1. Refuse the owner, a profile with the running workout, or an id with no
 *      registry row (`ProfileDeleteBlocked`). Nothing is touched.
 *   2. If the profile is active, switch to the owner, and close its
 *      connection if the switch left it open. A refused or failed switch stops
 *      here, with nothing deleted.
 *   3. Delete its SQLite file. A failure stops here too: the profile is still
 *      listed, with its data, and can be deleted again.
 *   4. Delete each of its per-profile SecureStore keys.
 *   5. Delete its registry row, last: an interrupted delete leaves a row whose
 *      file is recreated empty on the next switch, which is harmless (Review
 *      Focus 3).
 * From step 4 on the data is gone, so a failing step doesn't skip the ones
 * after it; the first error is re-thrown at the end.
 */
import { deleteBlock, OWNER_ID, PROFILE_SCOPED_KEYS, scopedKey, type ProfileRow } from '../domain/profiles.ts';

export type DeleteRefusal = 'owner' | 'workout' | 'busy' | 'missing';

/** A delete refused before anything was touched. */
export class ProfileDeleteBlocked extends Error {
  readonly reason: DeleteRefusal;
  constructor(reason: DeleteRefusal) {
    super(`Profile delete refused: ${reason}`);
    this.name = 'ProfileDeleteBlocked';
    this.reason = reason;
  }
}

export type DeleteProfileDeps<C> = {
  getProfile(id: string): Promise<ProfileRow | null>;
  /** The profile a running workout belongs to, or null (as switchProfile decides it). */
  activeWorkoutProfileId(): Promise<string | null>;
  currentProfileId(): string;
  currentConnection(): C;
  switchToOwner(): Promise<'ok' | 'same' | 'workout' | 'busy'>;
  /** Closes `conn` if it is still open. Never throws. */
  release(conn: C): void;
  deleteFile(id: string): Promise<void>;
  deleteKey(key: string): Promise<void>;
  deleteProfileRow(id: string): Promise<void>;
  /** Re-reads how many profiles exist, for the active-profile store. */
  refreshCount(): Promise<void>;
  warn?(message: string, error: unknown): void;
};

export function deleteProfileWith<C>(d: DeleteProfileDeps<C>) {
  const warn = d.warn ?? (() => {});
  return async function deleteProfile(id: string): Promise<void> {
    // 1.
    const profile = id === OWNER_ID ? null : await d.getProfile(id);
    if (id === OWNER_ID || profile?.isOwner) throw new ProfileDeleteBlocked('owner');
    if (profile === null) throw new ProfileDeleteBlocked('missing');
    const block = deleteBlock({ profile, activeWorkoutProfileId: await d.activeWorkoutProfileId() });
    if (block) throw new ProfileDeleteBlocked(block);

    // 2.
    if (d.currentProfileId() === id) {
      const conn = d.currentConnection();
      const result = await d.switchToOwner();
      if (result === 'workout' || result === 'busy') throw new ProfileDeleteBlocked(result);
      if (d.currentProfileId() === id) throw new Error(`Profile ${id} is still active after the switch`);
      d.release(conn);
    }

    // 3.
    await d.deleteFile(id);

    // 4–5. Each step on its own; keep the first error.
    let first: unknown = null;
    const attempt = async (what: string, step: () => Promise<void>) => {
      try {
        await step();
      } catch (e) {
        warn(`[deleteProfile] ${what} failed`, e);
        if (first === null) first = e;
      }
    };
    for (const key of PROFILE_SCOPED_KEYS) {
      await attempt(`deleting ${key}`, () => d.deleteKey(scopedKey(id, key)));
    }
    await attempt('registry delete', () => d.deleteProfileRow(id));
    await attempt('count refresh', () => d.refreshCount());
    if (first !== null) throw first;
  };
}
