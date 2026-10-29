/**
 * Run with: npm test — re-creating the SecureStore items stored before they
 * were written AFTER_FIRST_UNLOCK.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from '../db/sourceScan.ts';
import { PROFILE_SCOPED_KEYS } from '../domain/profiles.ts';
import {
  createMigratingStore,
  createMigrationScheduler,
  DEVICE_KEYS,
  KEYCHAIN_MIGRATION_MARKER,
  keychainKeysToMigrate,
  type KeychainMigration,
  type NativeStore,
} from './keychainMigration.ts';

const FRONTEND = join(import.meta.dirname, '..', '..');

test('the phone’s keys, then each profile’s own, once each', () => {
  const keys = keychainKeysToMigrate(['owner', 'abc']);
  for (const key of DEVICE_KEYS) assert.ok(keys.includes(key), key);
  // The owner keeps the plain names.
  for (const key of PROFILE_SCOPED_KEYS) assert.ok(keys.includes(key), key);
  assert.ok(keys.includes('ischys.p.abc.bodyweightKg'));
  assert.ok(keys.includes('ischys.p.abc.plateSetup.lb'));
  assert.equal(new Set(keys).size, keys.length, 'no repeats');
  assert.equal(keys.length, DEVICE_KEYS.length + 2 * PROFILE_SCOPED_KEYS.length);
  assert.ok(!keys.includes(KEYCHAIN_MIGRATION_MARKER), 'the marker is not migrated');
});

test('no profiles read yet: the phone’s keys alone', () => {
  assert.deepEqual(keychainKeysToMigrate([]), [...DEVICE_KEYS]);
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('every key the app stores is migrated', () => {
  // Files that use SecureStore, and every `'ischys.…'` literal in them.
  const users = ['src', 'app']
    .flatMap((root) => sourceFiles(join(FRONTEND, root)))
    .filter((path) => !path.endsWith('keychainMigration.ts'))
    .map((path) => withoutComments(readFileSync(path, 'utf8')))
    .filter((src) => /from '[./]+(?:src\/)?lib\/secureStore'|from '\.\/secureStore'/.test(src));
  assert.ok(users.length >= 15, `found only ${users.length} SecureStore users`);
  const known = new Set([...DEVICE_KEYS, ...PROFILE_SCOPED_KEYS]);
  const missing = new Set<string>();
  for (const src of users) {
    for (const [, key] of src.matchAll(/'(ischys\.[A-Za-z0-9_.]+)'/g)) {
      if (key === 'ischys.exerciseDemo.') continue; // a prefix, left out on purpose
      if (!known.has(key)) missing.add(key);
    }
  }
  assert.deepEqual([...missing], [], 'add these to DEVICE_KEYS (or PROFILE_SCOPED_KEYS)');
});

/**
 * A Keychain: each item remembers whether it was written with the new
 * accessibility. `locked` refuses reads of the old ones, as iOS does. Async
 * calls settle on a later macrotask, as native calls do; `hooks` run inside
 * them, at the moment the Keychain acts.
 */
function fakeKeychain(initial: Record<string, string>) {
  const items = new Map<string, { value: string; afterFirstUnlock: boolean }>(
    Object.entries(initial).map(([k, value]) => [k, { value, afterFirstUnlock: false }]),
  );
  const state = {
    locked: false,
    failSets: 0,
    failDeletes: new Set<string>(),
    beforeDelete: null as null | ((key: string) => void),
    afterRead: null as null | ((key: string) => void),
  };
  const later = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const read = (key: string) => {
    const item = items.get(key);
    if (item && state.locked && !item.afterFirstUnlock) throw new Error('errSecInteractionNotAllowed');
    return item?.value ?? null;
  };
  const write = (key: string, value: string) => {
    if (state.failSets > 0) {
      state.failSets -= 1;
      throw new Error('set failed');
    }
    const existing = items.get(key);
    // As expo does: an existing item is updated in place, accessibility and all.
    if (existing) existing.value = value;
    else items.set(key, { value, afterFirstUnlock: true });
  };
  const native: NativeStore = {
    getItem: read,
    async getItemAsync(key) {
      await later();
      const value = read(key);
      state.afterRead?.(key);
      return value;
    },
    setItem: write,
    async setItemAsync(key, value) {
      await later();
      write(key, value);
    },
    async deleteItemAsync(key) {
      await later();
      state.beforeDelete?.(key);
      if (state.failDeletes.has(key)) throw new Error('delete failed');
      items.delete(key);
    },
  };
  return { native, store: createMigratingStore(native), items, state };
}

test('re-creates every stored item with the new accessibility, then sets the marker', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.restSession': '{"x":1}' });
  const result = await kc.store.migrate(['ischys.bodyweightKg', 'ischys.restSession', 'ischys.themeId']);
  assert.deepEqual(result, { outcome: 'done', moved: 2, lost: [], marked: true });
  assert.deepEqual(kc.items.get('ischys.bodyweightKg'), { value: '80', afterFirstUnlock: true });
  assert.deepEqual(kc.items.get('ischys.restSession'), { value: '{"x":1}', afterFirstUnlock: true });
  assert.equal(kc.items.has('ischys.themeId'), false, 'nothing is created for an unset key');
  assert.equal(kc.items.get(KEYCHAIN_MIGRATION_MARKER)?.value, '1');

  // Readable locked now.
  kc.state.locked = true;
  assert.equal(await kc.store.getItemAsync('ischys.bodyweightKg'), '80');
});

test('runs once', async () => {
  const kc = fakeKeychain({ [KEYCHAIN_MIGRATION_MARKER]: '1', 'ischys.bodyweightKg': '80' });
  assert.deepEqual(await kc.store.migrate(['ischys.bodyweightKg']), { outcome: 'already' });
  assert.equal(kc.items.get('ischys.bodyweightKg')?.afterFirstUnlock, false, 'untouched');
});

test('locked: stops before touching anything and leaves the marker unset', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  kc.state.locked = true;
  assert.deepEqual(await kc.store.migrate(['ischys.bodyweightKg', 'ischys.themeId']), { outcome: 'locked' });
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false);
  kc.state.locked = false;
  assert.equal(kc.items.get('ischys.bodyweightKg')?.value, '80');
  assert.equal(kc.items.get('ischys.themeId')?.value, 'ember');

  // Next time, unlocked, it runs.
  const again = await kc.store.migrate(['ischys.bodyweightKg', 'ischys.themeId']);
  assert.deepEqual(again, { outcome: 'done', moved: 2, lost: [], marked: true });
});

test('a sync read while an item is between its delete and its store gets its value', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80' });
  const seen: (string | null)[] = [];
  kc.state.beforeDelete = (key) => {
    seen.push(kc.store.getItem(key));
    queueMicrotask(() => seen.push(kc.store.getItem(key))); // after the delete, before the store
  };
  await kc.store.migrate(['ischys.bodyweightKg']);
  assert.deepEqual(seen, ['80', '80']);
});

test('a sync write while an item is between its delete and its store is what is stored', async () => {
  for (const when of ['before', 'after'] as const) {
    const kc = fakeKeychain({ 'ischys.restSession': 'old' });
    kc.state.beforeDelete = (key) => {
      // The app's write landing on either side of the native delete.
      if (when === 'before') kc.store.setItem(key, 'new');
      else queueMicrotask(() => kc.store.setItem(key, 'new'));
    };
    const result = await kc.store.migrate(['ischys.restSession']);
    assert.equal(result.outcome, 'done');
    assert.deepEqual(kc.items.get('ischys.restSession'), { value: 'new', afterFirstUnlock: true }, when);
  }
});

test('a sync write while the item is being read is what is stored', async () => {
  const kc = fakeKeychain({ 'ischys.restSession': 'old' });
  kc.state.afterRead = (key) => {
    if (key !== 'ischys.restSession') return;
    kc.state.afterRead = null;
    kc.store.setItem(key, 'new'); // lands before the migration hears the read
  };
  await kc.store.migrate(['ischys.restSession']);
  assert.deepEqual(kc.items.get('ischys.restSession'), { value: 'new', afterFirstUnlock: true });
});

test('async calls made during the migration wait for it, and land after it', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.restSession': 'old' });
  const reads: (string | null)[] = [];
  let midway: Promise<void> | null = null;
  kc.state.beforeDelete = (key) => {
    if (key !== 'ischys.bodyweightKg' || midway) return;
    midway = (async () => {
      reads.push(await kc.store.getItemAsync('ischys.bodyweightKg'));
      await kc.store.setItemAsync('ischys.restSession', 'new');
      await kc.store.deleteItemAsync('ischys.bodyweightKg');
    })();
  };
  const result = await kc.store.migrate(['ischys.bodyweightKg', 'ischys.restSession']);
  assert.deepEqual(result, { outcome: 'done', moved: 2, lost: [], marked: true });
  await midway;
  assert.deepEqual(reads, ['80'], 'never sees the gap');
  assert.deepEqual(kc.items.get('ischys.restSession'), { value: 'new', afterFirstUnlock: true }, 'not reverted');
  assert.equal(kc.items.has('ischys.bodyweightKg'), false, 'the app’s delete, after');
});

test('async calls already under way finish before the migration starts', async () => {
  const kc = fakeKeychain({ 'ischys.restSession': 'old' });
  const write = kc.store.setItemAsync('ischys.restSession', 'new'); // not yet landed
  const result = await kc.store.migrate(['ischys.restSession']);
  await write;
  assert.equal(result.outcome, 'done');
  assert.deepEqual(kc.items.get('ischys.restSession'), { value: 'new', afterFirstUnlock: true });
});

test('a second migrate while one runs gets the same run', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80' });
  const a = kc.store.migrate(['ischys.bodyweightKg']);
  const b = kc.store.migrate(['ischys.bodyweightKg']);
  assert.equal(a, b);
  assert.deepEqual(await a, { outcome: 'done', moved: 1, lost: [], marked: true });
});

test('a store that fails is tried again', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80' });
  kc.state.beforeDelete = () => {
    kc.state.failSets = 1;
  };
  const result = await kc.store.migrate(['ischys.bodyweightKg']);
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: [], marked: true });
  assert.equal(kc.items.get('ischys.bodyweightKg')?.value, '80');
});

test('a store that fails twice is reported, and the marker is not set', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  kc.state.beforeDelete = (key) => {
    if (key === 'ischys.bodyweightKg') kc.state.failSets = 2;
  };
  const warnings: string[] = [];
  const result = await kc.store.migrate(['ischys.bodyweightKg', 'ischys.themeId'], (m) => warnings.push(m));
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: ['ischys.bodyweightKg'], marked: false });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ischys\.bodyweightKg/);
  assert.equal(kc.items.get('ischys.themeId')?.afterFirstUnlock, true, 'the rest carry on');
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false);
});

test('an item that could not be deleted is left as it was, and the marker is not set', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  kc.state.failDeletes.add('ischys.bodyweightKg');
  const result = await kc.store.migrate(['ischys.bodyweightKg', 'ischys.themeId']);
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: [], marked: false });
  assert.deepEqual(kc.items.get('ischys.bodyweightKg'), { value: '80', afterFirstUnlock: false });
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false);
  assert.equal(kc.store.getItem('ischys.bodyweightKg'), '80', 'nothing left in the gap');
});

function fakeApp(initial: string) {
  let state = initial;
  const listeners = new Set<(s: string) => void>();
  return {
    source: {
      current: () => state,
      subscribe(listener: (s: string) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    listenerCount: () => listeners.size,
    go(next: string) {
      state = next;
      for (const l of [...listeners]) l(next);
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('scheduler: in the foreground it runs now, and start hands back the run', async () => {
  const app = fakeApp('active');
  let runs = 0;
  const done: KeychainMigration = { outcome: 'done', moved: 0, lost: [], marked: true };
  const scheduler = createMigrationScheduler(app.source, async () => {
    runs += 1;
    return done;
  });
  const run = scheduler.start();
  assert.ok(run);
  assert.deepEqual(await run, done);
  assert.equal(scheduler.start(), null, 'once');
  assert.equal(runs, 1);
});

test('scheduler: in the background it waits for the app to be opened', async () => {
  const app = fakeApp('background');
  let runs = 0;
  const scheduler = createMigrationScheduler(app.source, async () => {
    runs += 1;
    return { outcome: 'already' };
  });
  assert.equal(scheduler.start(), null);
  app.go('inactive');
  await tick();
  assert.equal(runs, 0);
  app.go('active');
  await tick();
  assert.equal(runs, 1);
  app.go('background');
  app.go('active');
  await tick();
  assert.equal(runs, 1, 'once it has run');
  assert.equal(app.listenerCount(), 0);
});

test('scheduler: a locked or failed run tries again on the next return to active, not before', async () => {
  const app = fakeApp('active');
  const results: (KeychainMigration | Error)[] = [
    { outcome: 'locked' },
    new Error('registry unreadable'),
    { outcome: 'done', moved: 3, lost: [], marked: true },
  ];
  let runs = 0;
  const scheduler = createMigrationScheduler(app.source, async () => {
    const r = results[runs++];
    if (r instanceof Error) throw r;
    return r;
  });
  assert.deepEqual(await scheduler.start(), { outcome: 'locked' });
  await tick();
  assert.equal(runs, 1, 'not again while still active');
  app.go('background');
  app.go('active');
  await tick();
  assert.equal(runs, 2);
  app.go('background');
  app.go('active');
  await tick();
  assert.equal(runs, 3);
  app.go('background');
  app.go('active');
  await tick();
  assert.equal(runs, 3, 'done: no more');
  assert.equal(app.listenerCount(), 0);
});
