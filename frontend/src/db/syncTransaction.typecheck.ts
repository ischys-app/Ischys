/**
 * Checked by `npm run typecheck`, never imported, never run: the forms of
 * `db.transaction` that are not a transaction with this driver must not
 * compile, and the synchronous one must. A `@ts-expect-error` that stops
 * erroring fails the typecheck, so loosening the type in db/client.ts shows
 * up here. See db/atomic.ts for why they are not transactions.
 */
import type { db as Database } from './client';

declare const db: typeof Database;
declare function writeLater(): Promise<void>;
declare function writeNow(): void;

export function cases(): void {
  // The synchronous form is a real transaction, and hands back what it returns.
  db.transaction(() => writeNow());
  const count: number = db.transaction((tx) => {
    writeNow();
    return tx === undefined ? 0 : 1;
  });
  const rows: string[] = db.transaction<string[]>(() => []);
  const found: Map<string, { id: string }> = db.transaction(() => new Map());
  void count;
  void rows;
  void found;

  // @ts-expect-error an async arrow commits at its first await
  db.transaction(async () => {
    await writeLater();
  });
  // @ts-expect-error so does one with its type argument spelled out
  db.transaction<Promise<void>>(async () => {});
  // @ts-expect-error an async function passed by name
  db.transaction(writeLater);
  // @ts-expect-error a plain arrow that hands back a promise
  db.transaction(() => writeLater());
  // @ts-expect-error a plain arrow that hands back a chain
  db.transaction(() => writeLater().then(() => 1));
  // @ts-expect-error a thenable that is not a Promise
  db.transaction(() => ({ then: (done: () => void) => done() }));
}
