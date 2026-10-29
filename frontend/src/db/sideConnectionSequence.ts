/**
 * Reading a profile that isn't active (#117, Ruling R18): its counts for the
 * delete sheet, or its export. Pure, with every effect passed in, so
 * `node --test` covers it (sideConnectionSequence.test.ts); db/sideConnection.ts
 * wires it to expo-sqlite.
 *
 * - The file must already exist: opening a missing one creates an empty,
 *   unmigrated file, so a missing file is never opened and the read gives null.
 * - The file is migrated before anything reads it: only the active profile's
 *   file and new files are migrated otherwise, and a file left on an older
 *   schema would fail the first select of a newer column.
 * - The connection is closed whatever happens. `db` never moves, and nothing
 *   is seeded.
 */
export type SideDeps<C> = {
  exists(id: string): Promise<boolean>;
  open(id: string): C;
  migrate(conn: C): Promise<void>;
  close(conn: C): void;
};

export function sideReaderWith<C>(d: SideDeps<C>) {
  return async function readSide<T>(id: string, read: (conn: C) => Promise<T>): Promise<T | null> {
    if (!(await d.exists(id))) return null;
    const conn = d.open(id);
    try {
      await d.migrate(conn);
      return await read(conn);
    } finally {
      d.close(conn);
    }
  };
}
