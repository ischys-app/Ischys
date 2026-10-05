/** Run with: npm test — the begin/commit/rollback wrapper for awaited multi-statement writes. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAtomic } from './atomic.ts';

/** A stand-in connection: a committed store, and the open transaction's working copy. */
function fakeDb(failOn?: string) {
  const log: string[] = [];
  let committed: string[] = [];
  let working: string[] | null = null;
  const warnings: string[] = [];
  const atomic = createAtomic(
    (statement) => {
      log.push(statement);
      if (statement === failOn) throw new Error(`${statement} failed`);
      if (statement === 'begin immediate') {
        if (working) throw new Error('cannot start a transaction within a transaction');
        working = committed.slice();
      } else if (statement === 'commit') {
        committed = working!;
        working = null;
      } else {
        working = null;
      }
    },
    (message) => warnings.push(message),
  );
  /** One awaited statement, as the driver runs it: done at once, settled on a microtask. */
  const insert = async (row: string) => {
    log.push(`insert ${row}`);
    if (row === 'bad') throw new Error('constraint failed');
    (working ?? committed).push(row);
  };
  return { atomic, insert, log, warnings, stored: () => committed.slice() };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('every statement of the body is between one begin and one commit', async () => {
  const d = fakeDb();
  const result = await d.atomic.atomically(async () => {
    await d.insert('a');
    await d.insert('b');
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.deepEqual(d.log, ['begin immediate', 'insert a', 'insert b', 'commit']);
  assert.deepEqual(d.stored(), ['a', 'b']);
  assert.deepEqual(d.warnings, []);
});

test('a throw halfway stores nothing, and reaches the caller', async () => {
  const d = fakeDb();
  await assert.rejects(
    d.atomic.atomically(async () => {
      await d.insert('a');
      await d.insert('bad');
      await d.insert('c');
    }),
    /constraint failed/,
  );
  assert.deepEqual(d.log, ['begin immediate', 'insert a', 'insert bad', 'rollback']);
  assert.deepEqual(d.stored(), []);
  assert.equal(d.atomic.isOpen(), false);
});

test('a body that throws before its first await is rolled back too', async () => {
  const d = fakeDb();
  await assert.rejects(
    d.atomic.atomically(() => {
      throw new Error('sync');
    }),
    /sync/,
  );
  assert.deepEqual(d.log, ['begin immediate', 'rollback']);
});

test('a commit that fails rolls back and reports the commit’s error', async () => {
  const d = fakeDb('commit');
  await assert.rejects(d.atomic.atomically(async () => void (await d.insert('a'))), /commit failed/);
  assert.deepEqual(d.log, ['begin immediate', 'insert a', 'commit', 'rollback']);
  assert.deepEqual(d.stored(), []);
});

test('a rollback that fails does not hide why the body failed', async () => {
  const d = fakeDb('rollback');
  await assert.rejects(d.atomic.atomically(async () => void (await d.insert('bad'))), /constraint failed/);
  assert.equal(d.atomic.isOpen(), false);
});

test('a begin that fails runs no body and no rollback, and does not block the next one', async () => {
  const d = fakeDb('begin immediate');
  let ran = false;
  await assert.rejects(d.atomic.atomically(async () => void (ran = true)), /begin immediate failed/);
  assert.equal(ran, false);
  assert.deepEqual(d.log, ['begin immediate']);
  await assert.rejects(d.atomic.atomically(async () => {}), /begin immediate failed/);
});

test('it is open from begin to commit and not after', async () => {
  const d = fakeDb();
  assert.equal(d.atomic.isOpen(), false);
  await d.atomic.atomically(async () => {
    assert.equal(d.atomic.isOpen(), true);
    await d.insert('a');
    assert.equal(d.atomic.isOpen(), true);
  });
  assert.equal(d.atomic.isOpen(), false);
});

test('a body that only awaits statements never lets a timer in', async () => {
  const d = fakeDb();
  let timerRan = false;
  const timer = setTimeout(() => (timerRan = true), 0);
  let sawTimer = false;
  await d.atomic.atomically(async () => {
    for (let i = 0; i < 500; i++) await d.insert(`r${i}`);
    sawTimer = timerRan;
  });
  clearTimeout(timer);
  assert.equal(sawTimer, false);
  assert.deepEqual(d.warnings, []);
});

test('a body that gives the thread away is reported', async () => {
  const d = fakeDb();
  await d.atomic.atomically(async () => {
    await d.insert('a');
    await tick();
    await d.insert('b');
  });
  assert.equal(d.warnings.length, 1);
  // Still one transaction: the report is about what else could have run in it.
  assert.deepEqual(d.stored(), ['a', 'b']);
});

test('two at once run one after the other, never nested', async () => {
  const d = fakeDb();
  const first = d.atomic.atomically(async () => {
    await d.insert('a1');
    await tick();
    await d.insert('a2');
  });
  const second = d.atomic.atomically(async () => {
    await d.insert('b1');
  });
  await Promise.all([first, second]);
  assert.deepEqual(d.log, [
    'begin immediate', 'insert a1', 'insert a2', 'commit',
    'begin immediate', 'insert b1', 'commit',
  ]);
});

test('one that fails does not hold up the next', async () => {
  const d = fakeDb();
  const first = d.atomic.atomically(async () => void (await d.insert('bad')));
  const second = d.atomic.atomically(async () => void (await d.insert('b')));
  await assert.rejects(first, /constraint failed/);
  await second;
  assert.deepEqual(d.stored(), ['b']);
});

/** A fake whose queue gives up after 20 ms rather than the app's ten seconds. */
function impatientDb() {
  const log: string[] = [];
  let open = false;
  const atomic = createAtomic(
    (statement) => {
      if (statement === 'begin immediate' && open) throw new Error('cannot start a transaction within a transaction');
      open = statement === 'begin immediate';
      log.push(statement);
    },
    () => {},
    20,
  );
  const insert = async (row: string) => void log.push(`insert ${row}`);
  return { atomic, insert, log };
}

test('one started from inside another fails with a reason instead of waiting on itself', async () => {
  const d = impatientDb();
  await assert.rejects(
    d.atomic.atomically(async () => {
      await d.insert('a');
      // What a repo function that opens its own transaction does when called from a body.
      await d.atomic.atomically(async () => void (await d.insert('inner')));
      await d.insert('b');
    }),
    // The message names both ways a turn fails to come.
    (err: Error) => /inside another transaction/.test(err.message) && /other than a database statement/.test(err.message),
  );
  // The inner body never ran, and the outer one was rolled back whole.
  assert.deepEqual(d.log, ['begin immediate', 'insert a', 'rollback']);
  assert.equal(d.atomic.isOpen(), false);
  await d.atomic.atomically(async () => void (await d.insert('next')));
  assert.deepEqual(d.log.slice(3), ['begin immediate', 'insert next', 'commit']);
});

test('one that gave up waiting does not let the next start early', async () => {
  const d = impatientDb();
  let next: Promise<void> | undefined;
  await d.atomic.atomically(async () => {
    await d.insert('a1');
    await d.atomic.atomically(async () => {}).catch(() => {});
    // Queued behind the one that gave up, while this one is still open.
    next = d.atomic.atomically(async () => void (await d.insert('b')));
    await d.insert('a2');
  });
  await next;
  assert.deepEqual(d.log, [
    'begin immediate', 'insert a1', 'insert a2', 'commit',
    'begin immediate', 'insert b', 'commit',
  ]);
});

test('a long body that keeps the rule never makes the one behind it give up', async () => {
  const d = impatientDb();
  const first = d.atomic.atomically(async () => {
    const until = Date.now() + 60;
    // Three times the patience, without once handing the thread back.
    while (Date.now() < until) await d.insert('a');
  });
  const second = d.atomic.atomically(async () => void (await d.insert('b')));
  await Promise.all([first, second]);
  assert.deepEqual(d.log.slice(-3), ['begin immediate', 'insert b', 'commit']);
});

test('one stuck behind a body that left the thread gives up, and the one ahead still commits', async () => {
  const d = impatientDb();
  const first = d.atomic.atomically(async () => {
    await d.insert('a1');
    // Breaks the rule: three times the patience, with the thread handed back.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await d.insert('a2');
  });
  const second = d.atomic.atomically(async () => void (await d.insert('b')));
  await assert.rejects(second, /other than a database statement/);
  await first;
  assert.deepEqual(d.log, ['begin immediate', 'insert a1', 'insert a2', 'commit']);
});

test('bare statements from a chain in the same task land inside the transaction', async () => {
  // What the rule does not keep out: no timer runs, but microtasks take turns.
  const log: string[] = [];
  const warnings: string[] = [];
  const d = {
    log,
    warnings,
    atomic: createAtomic((statement) => void log.push(statement), (message) => void warnings.push(message)),
    insert: async (row: string) => void log.push(`insert ${row}`),
  };
  const bystander = async () => {
    for (let i = 0; i < 12; i++) await d.insert(`x${i}`);
  };
  await Promise.all([
    d.atomic.atomically(async () => {
      for (let i = 0; i < 4; i++) await d.insert(`a${i}`);
    }),
    bystander(),
  ]);
  const begin = log.indexOf('begin immediate');
  const commit = log.indexOf('commit');
  const within = log.slice(begin + 1, commit).filter((entry) => entry.startsWith('insert x'));
  assert.ok(within.length > 0, log.join(', '));
  // And nothing reported it: the thread never went back to the event loop.
  assert.deepEqual(d.warnings, []);
});
