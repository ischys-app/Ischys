/**
 * The on-device database. Opens the SQLite file, exposes a typed Drizzle handle,
 * and runs pending migrations at startup. FK enforcement is on. This module
 * touches native modules, so it is NEVER imported by node-tested code.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseSync } from 'expo-sqlite';

import migrations from '../../drizzle/migrations';
import { createAtomic } from './atomic';
import * as schema from './schema';

const expo = openDatabaseSync('ischys.db', { enableChangeListener: false });
expo.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(expo, { schema });

/** Either the db handle or a transaction handle — lets helpers run inside a
 * caller's transaction so multi-row writes stay atomic. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const atomic = createAtomic((statement) => expo.execSync(statement));

/**
 * Runs `body` in one real transaction: all of its statements are stored, or
 * none. The body is handed the connection itself, since on a single
 * connection everything run before the commit is inside the transaction.
 *
 * The body must await nothing but database statements — resolve SecureStore
 * and file reads before calling this. See db/atomic.ts for why, and for why
 * `db.transaction(async …)` is not this.
 */
export function atomically<T>(body: (tx: Executor) => Promise<T>): Promise<T> {
  return atomic.atomically(() => body(db));
}

/** Whether an `atomically` transaction is open on the connection right now. */
export const transactionOpen = (): boolean => atomic.isOpen();

/** Runs pending migrations; the app renders a splash until success is true. */
export function useDbReady() {
  return useMigrations(db, migrations);
}
