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

const connection = drizzle(expo, { schema });

/** The handle a `db.transaction` callback is given. */
type Transaction = Parameters<Parameters<typeof connection.transaction>[0]>[0];

/**
 * What a `db.transaction` callback may return: anything that is not a promise.
 * (`then?: never` is what a promise, or any thenable, cannot satisfy.)
 */
type Settled = (object & { then?: never }) | string | number | boolean | bigint | symbol | null | undefined | void;

/**
 * The connection, with `transaction` narrowed to a synchronous callback.
 *
 * The driver commits when the callback returns, so one that returns a promise
 * (an `async` arrow, an async function passed by name, a plain arrow handing
 * back a chain) has committed before its statements run. That used to
 * type-check; typed like this, `tsc` rejects it wherever it is written. Use
 * `atomically` below for a body that awaits. src/db/syncTransaction.typecheck.ts
 * holds the cases, and db/atomicCallSites.test.ts reads the source for the
 * commonest one as well.
 */
type Db = Omit<typeof connection, 'transaction'> & {
  transaction<T extends Settled>(
    body: (tx: Transaction) => T,
    config?: Parameters<typeof connection.transaction>[1],
  ): T;
};

export const db: Db = connection;

/** Either the db handle or a transaction handle — lets helpers run inside a
 * caller's transaction so multi-row writes stay atomic. */
export type Executor = Db | Transaction;

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
  return useMigrations(connection, migrations);
}
