/**
 * The on-device database. Opens the SQLite files and exposes typed Drizzle
 * handles, with FK enforcement on. db/bootstrap.ts runs the migrations. This module
 * touches native modules, so it is NEVER imported by node-tested code.
 *
 * Each profile has its own SQLite file (`ischys.db` is the owner's). `db` is a
 * facade over the current profile's connection: `useConnection` points it,
 * `atomically` and `transactionOpen` at another file, and the modules that
 * import them need not know. Nothing switches until profiles do.
 */
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { OWNER_ID } from '../domain/profiles';
import { createAtomic } from './atomic';
import * as schema from './schema';
import { createSwitchable } from './switchable';

/** The SQLite file a profile's data lives in. The owner's predates profiles. */
export function fileNameFor(profileId: string): string {
  return profileId === OWNER_ID ? 'ischys.db' : `ischys-${profileId}.db`;
}

function openExpo(profileId: string): SQLiteDatabase {
  const expo = openDatabaseSync(fileNameFor(profileId), { enableChangeListener: false });
  expo.execSync('PRAGMA foreign_keys = ON;');
  return expo;
}

const ownerExpo = openExpo(OWNER_ID);
const connection = drizzle(ownerExpo, { schema });

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

/** One profile's open database: the expo handle, its Drizzle handle, and the
 * `atomically` queue for that connection (each connection has its own). */
export type ProfileConnection = {
  id: string;
  fileName: string;
  expo: SQLiteDatabase;
  drizzle: Db;
  atomic: ReturnType<typeof createAtomic>;
};

function connect(id: string, expo: SQLiteDatabase, drizzleDb: Db): ProfileConnection {
  return {
    id,
    fileName: fileNameFor(id),
    expo,
    drizzle: drizzleDb,
    atomic: createAtomic((statement) => expo.execSync(statement)),
  };
}

const owner = connect(OWNER_ID, ownerExpo, connection);
let current: ProfileConnection = owner;
const switchable = createSwitchable<Db>(owner.drizzle);

/** Always the owner's `ischys.db`, whichever profile is current. */
export const deviceDb: Db = owner.drizzle;

/** The current profile's connection. A method read off it binds to the
 * connection current at that moment (db/switchable.ts). */
export const db: Db = switchable.handle;

/**
 * Opens a profile's file (the owner's is already open, and is handed back) with
 * FK enforcement on. It does not migrate: the caller runs migrations before
 * pointing `db` at it.
 */
export function openConnection(profileId: string): ProfileConnection {
  if (profileId === OWNER_ID) return owner;
  const expo = openExpo(profileId);
  return connect(profileId, expo, drizzle(expo, { schema }));
}

/** Points `db`, `atomically` and `transactionOpen` at `conn`. */
export function useConnection(conn: ProfileConnection): void {
  current = conn;
  switchable.swap(conn.drizzle);
}

export function currentConnection(): ProfileConnection {
  return current;
}

/** Closes a profile's file. The owner's stays open for the app's lifetime. */
export function closeConnection(conn: ProfileConnection): void {
  if (conn.id === OWNER_ID) return;
  conn.expo.closeSync();
}

/** Either the db handle or a transaction handle — lets helpers run inside a
 * caller's transaction so multi-row writes stay atomic. */
export type Executor = Db | Transaction;

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
  // The connection current at the call: its queue, and its handle for the
  // body, so every statement runs where the `begin` did.
  const conn = current;
  return conn.atomic.atomically(() => body(conn.drizzle));
}

/** Whether an `atomically` transaction is open on the current connection right now. */
export const transactionOpen = (): boolean => current.atomic.isOpen();
