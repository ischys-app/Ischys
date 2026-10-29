/** Run with: npm test — the order of deleting a profile, and what a failure leaves (#117, P8b). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { OWNER_ID, PROFILE_SCOPED_KEYS, type ProfileRow } from '../domain/profiles.ts';
import { deleteProfileWith, ProfileDeleteBlocked, type DeleteProfileDeps } from './deleteProfileSequence.ts';

type Conn = { id: string };

function row(id: string, isOwner = false): ProfileRow {
  return {
    id,
    name: id,
    initials: 'X',
    sort: 0,
    isOwner,
    createdAt: 0,
    workoutCount: 0,
    firstWorkoutAt: null,
    lastWorkoutAt: null,
  };
}

function world(
  o: { active?: string; running?: string | null; over?: Partial<DeleteProfileDeps<Conn>> } = {},
) {
  const log: string[] = [];
  const warned: string[] = [];
  let active = o.active ?? OWNER_ID;
  const rows: Record<string, ProfileRow> = { [OWNER_ID]: row(OWNER_ID, true), p1: row('p1'), p2: row('p2') };
  const deps: DeleteProfileDeps<Conn> = {
    getProfile: async (id) => rows[id] ?? null,
    activeWorkoutProfileId: async () => o.running ?? null,
    currentProfileId: () => active,
    currentConnection: () => ({ id: active }),
    switchToOwner: async () => {
      log.push('switch owner');
      active = OWNER_ID;
      return 'ok';
    },
    release: (c) => {
      log.push(`release ${c.id}`);
    },
    deleteFile: async (id) => {
      log.push(`delete file ${id}`);
    },
    deleteKey: async (key) => {
      log.push(`delete key ${key}`);
    },
    deleteProfileRow: async (id) => {
      log.push(`delete row ${id}`);
    },
    refreshCount: async () => {
      log.push('refresh count');
    },
    warn: (m) => warned.push(m),
    ...o.over,
  };
  return { log, warned, del: deleteProfileWith(deps) };
}

const keys = (id: string) => PROFILE_SCOPED_KEYS.map((k) => `delete key ischys.p.${id}.${k.replace(/^ischys\./, '')}`);

test('a non-active profile: file, then its keys, then the registry row last', async () => {
  const w = world();
  await w.del('p1');
  assert.deepEqual(w.log, ['delete file p1', ...keys('p1'), 'delete row p1', 'refresh count']);
});

test('the active profile: switches to the owner first, releases its connection, then deletes', async () => {
  const w = world({ active: 'p1' });
  await w.del('p1');
  assert.deepEqual(w.log, [
    'switch owner',
    'release p1',
    'delete file p1',
    ...keys('p1'),
    'delete row p1',
    'refresh count',
  ]);
});

test('the owner is never deleted', async () => {
  const w = world();
  await assert.rejects(w.del(OWNER_ID), (e) => e instanceof ProfileDeleteBlocked && e.reason === 'owner');
  assert.deepEqual(w.log, []);
});

test('a profile with the running workout is not deleted, active or not', async () => {
  for (const active of [OWNER_ID, 'p1']) {
    const w = world({ active, running: 'p1' });
    await assert.rejects(w.del('p1'), (e) => e instanceof ProfileDeleteBlocked && e.reason === 'workout');
    assert.deepEqual(w.log, []);
  }
});

test('a workout running in another profile does not block the delete', async () => {
  const w = world({ running: 'p2' });
  await w.del('p1');
  assert.ok(w.log.includes('delete row p1'));
});

test('a profile with no registry row is refused, nothing touched', async () => {
  const w = world();
  await assert.rejects(w.del('ghost'), (e) => e instanceof ProfileDeleteBlocked && e.reason === 'missing');
  assert.deepEqual(w.log, []);
});

test('a refused switch to the owner stops before anything is deleted', async () => {
  for (const result of ['workout', 'busy'] as const) {
    const w = world({ active: 'p1', over: { switchToOwner: async () => result } });
    await assert.rejects(w.del('p1'), (e) => e instanceof ProfileDeleteBlocked && e.reason === result);
    assert.deepEqual(w.log, []);
  }
});

test('a switch that throws stops before anything is deleted', async () => {
  const w = world({
    active: 'p1',
    over: {
      switchToOwner: async () => {
        throw new Error('switch');
      },
    },
  });
  await assert.rejects(w.del('p1'), /switch/);
  assert.deepEqual(w.log, []);
});

test('a switch that leaves the profile active is not trusted: nothing deleted', async () => {
  const w = world({ active: 'p1', over: { switchToOwner: async () => 'ok' } });
  await assert.rejects(w.del('p1'), /still active/);
  assert.deepEqual(w.log, []);
});

test('a failed file delete stops there: keys and row stay, so the profile is still listed', async () => {
  const w = world({
    over: {
      deleteFile: async () => {
        throw new Error('unlink');
      },
    },
  });
  await assert.rejects(w.del('p1'), /unlink/);
  assert.deepEqual(w.log, []);
});

test('after the file is gone, a failing step does not skip the rest; the first error is re-thrown', async () => {
  let n = 0;
  const w = world({
    over: {
      deleteKey: async (key) => {
        n++;
        if (n === 2) throw new Error('key');
        w.log.push(`delete key ${key}`);
      },
      deleteProfileRow: async () => {
        throw new Error('row');
      },
    },
  });
  await assert.rejects(w.del('p1'), /key/);
  // Every other key still went, the row was attempted, and the count refreshed.
  assert.equal(w.log.filter((l) => l.startsWith('delete key')).length, PROFILE_SCOPED_KEYS.length - 1);
  assert.equal(w.log.at(-1), 'refresh count');
  assert.equal(w.warned.length, 2);
});
