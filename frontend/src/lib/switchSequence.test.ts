/** Run with: npm test — the order of a profile switch, and what a failure leaves (#117). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSwitcher, type SwitchDeps } from './switchSequence.ts';

type Conn = { id: string; closed: boolean };
type P = { id: string; name: string };

const OWNER: P = { id: 'owner', name: 'Vasilis' };
const MARIA: P = { id: 'm1', name: 'Μαρία Παπαδάκη' };

/** A fake world: two profiles, the owner active, and a log of every step. */
function world(over: Partial<SwitchDeps<Conn, P>> = {}) {
  const log: string[] = [];
  const owner: Conn = { id: 'owner', closed: false };
  const state = { conn: owner, profile: OWNER, count: 2 };
  const deps: SwitchDeps<Conn, P> = {
    currentProfile: () => state.profile,
    activeWorkoutProfileId: async () => null,
    transactionOpen: () => false,
    listProfiles: async () => [OWNER, MARIA],
    refreshStats: async () => void log.push(`stats:${state.conn.id}`),
    currentConnection: () => state.conn,
    openConnection: (id) => {
      log.push(`open:${id}`);
      return id === 'owner' ? owner : { id, closed: false };
    },
    prepareConnection: async (c) => void log.push(`prepare:${c.id}`),
    useConnection: (c) => {
      log.push(`use:${c.id}`);
      state.conn = c;
    },
    closeConnection: (c) => {
      if (c === state.conn) throw new Error('closing the current connection');
      log.push(`close:${c.id}`);
      if (c.id !== 'owner') c.closed = true;
    },
    setActiveProfile: (p, n) => {
      log.push(`active:${p.id}:${n}`);
      state.profile = p;
      state.count = n;
    },
    runHooks: () => void log.push('hooks'),
    primeSettings: async () => void log.push(`prime:${state.conn.id}`),
    rememberProfile: (id) => void log.push(`remember:${id}`),
    bumpEpoch: () => void log.push('epoch'),
    haptic: () => void log.push('haptic'),
    announce: (text) => void log.push(`announce:${text}`),
    ...over,
  };
  return { log, state, owner, switchTo: createSwitcher(deps) };
}

test('a switch runs every step, in order', async () => {
  const { log, state, switchTo } = world();
  assert.equal(await switchTo('m1'), 'ok');
  assert.deepEqual(log, [
    'stats:owner',
    'open:m1',
    'prepare:m1',
    'use:m1',
    'active:m1:2',
    'close:owner',
    'hooks',
    'prime:m1',
    'remember:m1',
    'epoch',
    'haptic',
    'announce:Switched to Μαρία Παπαδάκη',
  ]);
  assert.equal(state.conn.id, 'm1');
  assert.equal(state.profile, MARIA);
});

test('switching back closes the profile file it leaves', async () => {
  const { log, state, switchTo } = world();
  await switchTo('m1');
  const left = state.conn;
  log.length = 0;
  assert.equal(await switchTo('owner'), 'ok');
  assert.ok(log.includes('close:m1'));
  assert.equal(left.closed, true);
  assert.equal(state.conn.id, 'owner');
});

test('the current profile is refused as "same", with nothing done', async () => {
  const { log, switchTo } = world();
  assert.equal(await switchTo('owner'), 'same');
  assert.deepEqual(log, []);
});

test('a running workout blocks the switch', async () => {
  const { log, switchTo } = world({ activeWorkoutProfileId: async () => 'owner' });
  assert.equal(await switchTo('m1'), 'workout');
  assert.deepEqual(log, []);
});

test('an open transaction blocks the switch', async () => {
  const { log, switchTo } = world({ transactionOpen: () => true });
  assert.equal(await switchTo('m1'), 'busy');
  assert.deepEqual(log, []);
});

test('a transaction opened while the file was being prepared stops the switch', async () => {
  let open = false;
  const { log, state, switchTo } = world({
    transactionOpen: () => open,
    prepareConnection: async () => {
      open = true;
    },
  });
  assert.equal(await switchTo('m1'), 'busy');
  assert.equal(state.conn.id, 'owner');
  assert.equal(state.profile, OWNER);
  assert.ok(log.includes('close:m1'), 'the opened file is closed again');
  assert.ok(!log.includes('epoch'));
});

test('a second switch while one is running is refused as "busy"', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { switchTo } = world({ prepareConnection: () => gate });
  const first = switchTo('m1');
  assert.equal(await switchTo('m1'), 'busy');
  release();
  assert.equal(await first, 'ok');
});

test('an unknown profile throws before anything changes', async () => {
  const { log, state, switchTo } = world();
  await assert.rejects(switchTo('gone'));
  assert.deepEqual(log, []);
  assert.equal(state.conn.id, 'owner');
});

test('a file that fails to prepare leaves the previous profile active, and is closed', async () => {
  const { log, state, switchTo } = world({
    prepareConnection: async () => {
      throw new Error('migration failed');
    },
  });
  await assert.rejects(switchTo('m1'), /migration failed/);
  assert.equal(state.conn.id, 'owner');
  assert.equal(state.profile, OWNER);
  assert.ok(log.includes('close:m1'));
  assert.ok(!log.includes('hooks') && !log.includes('epoch') && !log.includes('remember:m1'));
});

test('a file that fails to open leaves the previous profile active', async () => {
  const { state, switchTo } = world({
    openConnection: () => {
      throw new Error('cannot open');
    },
  });
  await assert.rejects(switchTo('m1'), /cannot open/);
  assert.equal(state.conn.id, 'owner');
  assert.equal(state.profile, OWNER);
});

test('a failure after db moved puts the previous connection and profile back', async () => {
  const { log, state, owner, switchTo } = world({
    setActiveProfile: (p) => {
      if (p.id === 'm1') throw new Error('listener threw');
    },
  });
  await assert.rejects(switchTo('m1'), /listener threw/);
  assert.equal(state.conn, owner);
  assert.equal(state.profile, OWNER);
  assert.ok(log.includes('close:m1'));
  assert.ok(!log.includes('close:owner'));
});

test('stats that fail to refresh do not stop the switch', async () => {
  const { switchTo, state } = world({
    refreshStats: async () => {
      throw new Error('stats');
    },
  });
  assert.equal(await switchTo('m1'), 'ok');
  assert.equal(state.conn.id, 'm1');
});

test('a file that fails to close does not undo a finished switch', async () => {
  const { switchTo, state } = world({
    closeConnection: () => {
      throw new Error('busy file');
    },
  });
  assert.equal(await switchTo('m1'), 'ok');
  assert.equal(await switchTo('owner'), 'ok');
  assert.equal(state.conn.id, 'owner');
});
