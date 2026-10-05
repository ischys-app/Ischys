/**
 * A real transaction around an awaited body: `begin immediate`, the body,
 * `commit`; on any throw `rollback`, and the throw goes on to the caller.
 *
 * Why not `db.transaction(async (tx) => …)`: the expo-sqlite driver is
 * synchronous. It runs `begin`, calls the callback, and runs `commit` the
 * moment the callback returns — which for an `async` callback is at its first
 * `await`, with a promise in hand. Every statement after that commits on its
 * own, and a failure or a force-quit halfway leaves the first half stored.
 * (A synchronous callback is bracketed properly; see data/prBackfill.ts.)
 *
 * THE RULE for a body: await nothing but database statements. The app has one
 * connection, so whatever runs a statement while this is open runs it inside
 * this transaction. Awaiting a statement only ever waits on microtasks (the
 * driver executes it synchronously and hands back a settled promise), so a
 * body that keeps the rule runs from `begin` to `commit` without the JS
 * thread ever going back to the event loop: no timer, focus refresh, touch
 * handler or native callback can run in between. Read SecureStore, files and
 * anything else that really waits BEFORE calling this.
 *
 * What happens if a body breaks the rule and something else does run:
 *  - a read sees this transaction's uncommitted rows;
 *  - a lone write joins it, and is lost with it if it rolls back;
 *  - a `db.transaction(…)` fails at its own `begin` ("cannot start a
 *    transaction within a transaction") without touching this one;
 *  - another `atomically` waits its turn (they are queued here).
 * So this transaction stays all-or-nothing either way; it is the bystander
 * that suffers. A body that gives the thread away is reported through
 * `onYield`, so the mistake shows up in the logs the first time it is made.
 *
 * Pure: it is handed the three statements to run, so it is node-tested.
 * db/client.ts binds it to the connection as `atomically`.
 */

export type TransactionStatement = 'begin immediate' | 'commit' | 'rollback';

export type Atomic = {
  /** Runs `body` inside one transaction and resolves to what it returns. */
  atomically<T>(body: () => Promise<T>): Promise<T>;
  /** Whether a transaction started here is open right now. */
  isOpen(): boolean;
};

export function createAtomic(
  run: (statement: TransactionStatement) => void,
  onYield: (message: string) => void = (message) => console.warn(message),
): Atomic {
  let open = false;
  /** Settles when the transaction ahead of the next caller is over. Never rejects. */
  let tail: Promise<void> = Promise.resolve();

  async function atomically<T>(body: () => Promise<T>): Promise<T> {
    const ahead = tail;
    let done!: () => void;
    tail = new Promise<void>((resolve) => (done = resolve));
    await ahead;

    let yielded = false;
    let watch: ReturnType<typeof setTimeout> | undefined;
    try {
      run('begin immediate');
      open = true;
      // A timer only fires once the thread is back at the event loop.
      watch = setTimeout(() => {
        yielded = true;
      }, 0);
      const result = await body();
      run('commit');
      return result;
    } catch (err) {
      if (open) {
        try {
          run('rollback');
        } catch {
          // SQLite had already rolled it back itself (a full disk, say).
        }
      }
      throw err;
    } finally {
      clearTimeout(watch);
      open = false;
      done();
      if (yielded) {
        onYield(
          '[db] a transaction body waited on something other than a database statement; ' +
            'other statements may have run inside it',
        );
      }
    }
  }

  return { atomically, isOpen: () => open };
}
