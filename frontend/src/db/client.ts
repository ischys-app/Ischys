/**
 * The on-device database. Opens the SQLite file, exposes a typed Drizzle handle,
 * and runs pending migrations at startup. FK enforcement is on. This module
 * touches native modules, so it is NEVER imported by node-tested code.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import * as schema from './schema';

const expo = openDatabaseSync('ischys.db', { enableChangeListener: false });
expo.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expo, { schema });

/** Runs pending migrations; the app renders a splash until success is true. */
export function useDbReady() {
  return useMigrations(db, migrations);
}
