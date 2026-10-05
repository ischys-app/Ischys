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
