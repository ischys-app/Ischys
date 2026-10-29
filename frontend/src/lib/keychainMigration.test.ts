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
  DEVICE_KEYS,
  KEYCHAIN_MIGRATION_MARKER,
  keychainKeysToMigrate,
  migrateKeychain,
  type KeychainStore,
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
 * accessibility. `locked` refuses reads of the old ones, as iOS does.
 */
function fakeKeychain(initial: Record<string, string>) {
  const items = new Map<string, { value: string; afterFirstUnlock: boolean }>(
    Object.entries(initial).map(([k, value]) => [k, { value, afterFirstUnlock: false }]),
  );
  const state = { locked: false, failSets: 0, onDelete: null as null | ((key: string) => void) };
  const read = (key: string) => {
    const item = items.get(key);
    if (item && state.locked && !item.afterFirstUnlock) throw new Error('errSecInteractionNotAllowed');
    return item?.value ?? null;
  };
  const store: KeychainStore = {
    getItemAsync: async (key) => read(key),
    getItem: read,
    setItem(key, value) {
      if (state.failSets > 0) {
        state.failSets -= 1;
        throw new Error('set failed');
      }
      const existing = items.get(key);
      // As expo does: an existing item is updated in place, accessibility and all.
      if (existing) existing.value = value;
      else items.set(key, { value, afterFirstUnlock: true });
    },
    async deleteItemAsync(key) {
      items.delete(key);
      state.onDelete?.(key);
    },
  };
  return { store, items, state };
}

test('re-creates every stored item with the new accessibility, then sets the marker', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.restSession': '{"x":1}' });
  const result = await migrateKeychain(kc.store, ['ischys.bodyweightKg', 'ischys.restSession', 'ischys.themeId']);
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
  assert.deepEqual(await migrateKeychain(kc.store, ['ischys.bodyweightKg']), { outcome: 'already' });
  assert.equal(kc.items.get('ischys.bodyweightKg')?.afterFirstUnlock, false, 'untouched');
});

test('locked: stops before touching anything and leaves the marker unset', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  kc.state.locked = true;
  assert.deepEqual(await migrateKeychain(kc.store, ['ischys.bodyweightKg', 'ischys.themeId']), {
    outcome: 'locked',
  });
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false);
  kc.state.locked = false;
  assert.equal(kc.items.get('ischys.bodyweightKg')?.value, '80');
  assert.equal(kc.items.get('ischys.themeId')?.value, 'ember');

  // Next launch, unlocked, it runs.
  const again = await migrateKeychain(kc.store, ['ischys.bodyweightKg', 'ischys.themeId']);
  assert.deepEqual(again, { outcome: 'done', moved: 2, lost: [], marked: true });
});

test('a value written between the delete and the store is kept', async () => {
  const kc = fakeKeychain({ 'ischys.restSession': 'old' });
  kc.state.onDelete = (key) => {
    kc.state.onDelete = null;
    kc.store.setItem(key, 'new'); // a rest started meanwhile
  };
  const result = await migrateKeychain(kc.store, ['ischys.restSession']);
  assert.deepEqual(result, { outcome: 'done', moved: 0, lost: [], marked: true });
  assert.deepEqual(kc.items.get('ischys.restSession'), { value: 'new', afterFirstUnlock: true });
});

test('a store that fails is tried again', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80' });
  kc.state.failSets = 1;
  const result = await migrateKeychain(kc.store, ['ischys.bodyweightKg']);
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: [], marked: true });
  assert.equal(kc.items.get('ischys.bodyweightKg')?.value, '80');
});

test('a store that fails twice is reported', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  kc.state.failSets = 2;
  const warnings: string[] = [];
  const result = await migrateKeychain(kc.store, ['ischys.bodyweightKg', 'ischys.themeId'], (m) => warnings.push(m));
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: ['ischys.bodyweightKg'], marked: false });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ischys\.bodyweightKg/);
  assert.equal(kc.items.get('ischys.themeId')?.afterFirstUnlock, true, 'the rest carry on');
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false, 'tried again next time');
});

test('an item that could not be deleted is left as it was, and the marker is not set', async () => {
  const kc = fakeKeychain({ 'ischys.bodyweightKg': '80', 'ischys.themeId': 'ember' });
  const store: KeychainStore = {
    ...kc.store,
    deleteItemAsync: async (key) => {
      if (key === 'ischys.bodyweightKg') throw new Error('delete failed');
      return kc.store.deleteItemAsync(key);
    },
  };
  const result = await migrateKeychain(store, ['ischys.bodyweightKg', 'ischys.themeId']);
  assert.deepEqual(result, { outcome: 'done', moved: 1, lost: [], marked: false });
  assert.deepEqual(kc.items.get('ischys.bodyweightKg'), { value: '80', afterFirstUnlock: false });
  assert.equal(kc.items.has(KEYCHAIN_MIGRATION_MARKER), false);
});
