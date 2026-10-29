/** Run with: npm test — adding a profile, and that a failure leaves no half-created profile (#117). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createProfileWith, type CreateProfileDeps } from './createProfileSequence.ts';

type Conn = { id: string };
type P = { id: string; name: string };

function world(over: Partial<CreateProfileDeps<Conn, P, string>> = {}) {
  const log: string[] = [];
  const deps: CreateProfileDeps<Conn, P, string> = {
    insertProfile: async (name) => {
      log.push(`insert ${name}`);
      return { id: 'p1', name };
    },
    readCopy: async () => {
      log.push('read');
      return 'routines';
    },
    openConnection: (id) => {
      log.push(`open ${id}`);
      return { id };
    },
    prepareConnection: async (c) => {
      log.push(`prepare ${c.id}`);
    },
    writeCopy: async (c, copy) => {
      log.push(`write ${c.id} ${copy}`);
    },
    closeConnection: (c) => {
      log.push(`close ${c.id}`);
    },
    deleteFile: async (id) => {
      log.push(`delete file ${id}`);
    },
    deleteProfileRow: async (id) => {
      log.push(`delete row ${id}`);
    },
    ...over,
  };
  return { log, create: createProfileWith(deps) };
}

test('without a copy: insert, open, prepare, close', async () => {
  const w = world();
  const p = await w.create({ name: 'Maria', initials: 'M', copyRoutines: false });
  assert.deepEqual(p, { id: 'p1', name: 'Maria' });
  assert.deepEqual(w.log, ['insert Maria', 'open p1', 'prepare p1', 'close p1']);
});

test('with a copy: reads first, writes into the new file before closing it', async () => {
  const w = world();
  await w.create({ name: 'Maria', initials: 'M', copyRoutines: true });
  assert.deepEqual(w.log, ['read', 'insert Maria', 'open p1', 'prepare p1', 'write p1 routines', 'close p1']);
});

test('a failed read creates nothing', async () => {
  const w = world({
    readCopy: async () => {
      throw new Error('read');
    },
  });
  await assert.rejects(w.create({ name: 'Maria', initials: 'M', copyRoutines: true }), /read/);
  assert.deepEqual(w.log, []);
});

test('a failed copy closes and deletes the file, removes the row, re-throws', async () => {
  const w = world({
    writeCopy: async () => {
      throw new Error('copy');
    },
  });
  await assert.rejects(w.create({ name: 'Maria', initials: 'M', copyRoutines: true }), /copy/);
  assert.deepEqual(w.log, [
    'read',
    'insert Maria',
    'open p1',
    'prepare p1',
    'close p1',
    'delete file p1',
    'delete row p1',
  ]);
});

test('a failed prepare cleans up the same way', async () => {
  const w = world({
    prepareConnection: async () => {
      throw new Error('migrate');
    },
  });
  await assert.rejects(w.create({ name: 'Maria', initials: 'M', copyRoutines: false }), /migrate/);
  assert.deepEqual(w.log, ['insert Maria', 'open p1', 'close p1', 'delete file p1', 'delete row p1']);
});

test('a file that never opened is not closed, but the row still goes', async () => {
  const w = world({
    openConnection: () => {
      throw new Error('open');
    },
  });
  await assert.rejects(w.create({ name: 'Maria', initials: 'M', copyRoutines: false }), /open/);
  assert.deepEqual(w.log, ['insert Maria', 'delete file p1', 'delete row p1']);
});

test('a cleanup step that fails does not skip the others, and the first error is kept', async () => {
  const warned: string[] = [];
  const w = world({
    writeCopy: async () => {
      throw new Error('copy');
    },
    closeConnection: () => {
      throw new Error('close');
    },
    deleteFile: async () => {
      throw new Error('unlink');
    },
    warn: (m) => warned.push(m),
  });
  await assert.rejects(w.create({ name: 'Maria', initials: 'M', copyRoutines: true }), /copy/);
  assert.ok(w.log.includes('delete row p1'));
  assert.equal(warned.length, 2);
});
