/**
 * The order of adding a profile (P4, #117), and what a failure leaves behind.
 *
 * Pure, with every effect passed in, so `node --test` covers it
 * (createProfileSequence.test.ts); src/lib/createProfile.ts wires it to the
 * registry, the files and the routine copy.
 *
 * The rule: no half-created profile stays in the list. Whatever fails after
 * the registry row is inserted, the new file is closed and deleted and the row
 * removed, then the error is re-thrown. The current profile's routines are
 * read before anything is created, so a failed read creates nothing.
 */
export type CreateProfileDeps<C, P extends { id: string }, Copy> = {
  insertProfile(name: string, initials: string): Promise<P>;
  /** Reads the current profile's routines (and what they need). */
  readCopy(): Promise<Copy>;
  openConnection(id: string): C;
  /** Migrates and seeds `conn` without moving `db`. */
  prepareConnection(conn: C): Promise<void>;
  /** Writes `copy` into `conn`, all or nothing. */
  writeCopy(conn: C, copy: Copy): Promise<void>;
  closeConnection(conn: C): void;
  deleteFile(id: string): Promise<void>;
  deleteProfileRow(id: string): Promise<void>;
  warn?(message: string, error: unknown): void;
};

export function createProfileWith<C, P extends { id: string }, Copy>(d: CreateProfileDeps<C, P, Copy>) {
  const warn = d.warn ?? (() => {});
  return async function createProfile(a: { name: string; initials: string; copyRoutines: boolean }): Promise<P> {
    const copy = a.copyRoutines ? await d.readCopy() : null;
    const row = await d.insertProfile(a.name, a.initials);
    let conn: C | null = null;
    try {
      conn = d.openConnection(row.id);
      await d.prepareConnection(conn);
      if (copy !== null) await d.writeCopy(conn, copy);
      const done = conn;
      conn = null;
      d.closeConnection(done);
      return row;
    } catch (e) {
      // Undo in reverse, each step on its own: one failing doesn't skip the rest.
      if (conn !== null) {
        try {
          d.closeConnection(conn);
        } catch (closeError) {
          warn('[createProfile] close failed', closeError);
        }
      }
      try {
        await d.deleteFile(row.id);
      } catch (deleteError) {
        warn('[createProfile] file delete failed', deleteError);
      }
      try {
        await d.deleteProfileRow(row.id);
      } catch (rowError) {
        warn('[createProfile] registry delete failed', rowError);
      }
      throw e;
    }
  };
}

/** How an Add press ended: the create failed, or it succeeded and the switch did what. */
export type AddOutcome =
  | { created: false }
  | { created: true; switched: 'ok' | 'same' | 'workout' | 'busy' | 'threw' };

/**
 * What the Add profile screen does next.
 * - `'none'`: the switch went through and dismisses the screen itself.
 * - `'back'`: the profile exists and is whole, but the switch was refused or
 *   failed. Go back (warning haptic); it is in the switcher. Never offer a
 *   retry here: that would create a second profile.
 * - `'retry'`: nothing was created (the create cleaned up after itself), so
 *   say so and let Add be pressed again.
 */
export function afterCreate(o: AddOutcome): 'none' | 'back' | 'retry' {
  if (!o.created) return 'retry';
  return o.switched === 'ok' ? 'none' : 'back';
}
