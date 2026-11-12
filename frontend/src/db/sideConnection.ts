/**
 * Wires sideConnectionSequence.ts (tested there) to the profile files: reads
 * a profile that isn't active from its own file, migrated first, without
 * moving `db` and without ever creating the file.
 */
import { getInfoAsync } from 'expo-file-system/legacy';
import { defaultDatabaseDirectory } from 'expo-sqlite';

import { closeConnection, fileNameFor, openConnection, type ProfileConnection } from './client';
import { migrateConnection } from './migrateConnection';
import { sideReaderWith } from './sideConnectionSequence';

/** The file's URI in expo-sqlite's default directory (a plain path on iOS, maybe a URI elsewhere). */
function fileUri(id: string): string {
  const dir = String(defaultDatabaseDirectory ?? '');
  const base = dir.startsWith('file://') ? dir : `file://${dir}`;
  return `${base.replace(/\/$/, '')}/${fileNameFor(id)}`;
}

/** Whether profile `id`'s SQLite file is on disk. Never creates it. */
export async function profileFileExists(id: string): Promise<boolean> {
  return (await getInfoAsync(fileUri(id))).exists;
}

/**
 * Runs `read` on profile `id`'s file, migrated, then closes it. Null when the
 * file doesn't exist.
 */
export const readSideConnection: <T>(
  id: string,
  read: (conn: ProfileConnection) => Promise<T>,
) => Promise<T | null> = sideReaderWith<ProfileConnection>({
  exists: profileFileExists,
  open: openConnection,
  migrate: migrateConnection,
  close: closeConnection,
});
