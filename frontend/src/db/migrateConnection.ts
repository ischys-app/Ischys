/**
 * Runs a profile file's pending Drizzle migrations on the connection it is
 * handed. It never points `db` at the file and never seeds: a side connection
 * (a profile that isn't active, read for its counts or its export) is brought
 * to the current schema before anything selects from it, since only the active
 * profile's file and new files are migrated otherwise.
 *
 * Its own module, so data/ code can use it without importing db/bootstrap
 * (which imports data/profilesRepo).
 */
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import migrations from '../../drizzle/migrations';
import type { ProfileConnection } from './client';
import * as schema from './schema';

/** `conn.drizzle` is the full Drizzle handle, typed with `transaction` narrowed (client.ts), hence the cast. */
export function migrateConnection(conn: ProfileConnection): Promise<void> {
  return migrate(conn.drizzle as unknown as ExpoSQLiteDatabase<typeof schema>, migrations);
}
