/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_BAR_SETUP, DEFAULT_LB_BAR_SETUP, type BarSetup } from '../domain/plateMath.ts';
import { plateSetupKey, readPlateSetup, writePlateSetup, type KeyValueStore } from './plateSetupStore.ts';

/** An in-memory stand-in for SecureStore. */
function fakeStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  const store: KeyValueStore = {
    getItemAsync: async (key) => data.get(key) ?? null,
    setItemAsync: async (key, value) => {
      data.set(key, value);
    },
  };
  return { data, store };
}

const brokenStore: KeyValueStore = {
  getItemAsync: async () => {
    throw new Error('keychain unavailable');
  },
  setItemAsync: async () => {
    throw new Error('keychain unavailable');
  },
};

/** What a kg user had saved before pounds existed: no unit field, the old key. */
const LEGACY_KEY = 'ischys.plateSetup';
const LEGACY_BLOB = '{"barKg":15,"pairs":[{"kg":20,"count":2},{"kg":1.25,"count":0}]}';

test('kilograms keep the key they always had', () => {
  assert.equal(plateSetupKey('kg'), LEGACY_KEY);
  assert.notEqual(plateSetupKey('lb'), LEGACY_KEY);
});

test('a setup saved before units existed is still the kg setup, untouched', async () => {
  const { data, store } = fakeStore({ [LEGACY_KEY]: LEGACY_BLOB });
  assert.deepEqual(await readPlateSetup(store, 'kg'), {
    barKg: 15,
    pairs: [
      { kg: 20, count: 2 },
      { kg: 1.25, count: 0 },
    ],
  });
  // Reading migrates nothing: the blob is byte-for-byte what was there.
  assert.equal(data.get(LEGACY_KEY), LEGACY_BLOB);
  assert.equal(data.size, 1);
});

test('a first look in pounds gets the pound set, not the saved kg one', async () => {
  const { store } = fakeStore({ [LEGACY_KEY]: LEGACY_BLOB });
  assert.deepEqual(await readPlateSetup(store, 'lb'), DEFAULT_LB_BAR_SETUP);
});

test('with nothing stored each unit reads its own default', async () => {
  const { store } = fakeStore();
  assert.deepEqual(await readPlateSetup(store, 'kg'), DEFAULT_BAR_SETUP);
  assert.deepEqual(await readPlateSetup(store, 'lb'), DEFAULT_LB_BAR_SETUP);
});

test('saving a pound setup leaves the kg one alone', async () => {
  const { data, store } = fakeStore({ [LEGACY_KEY]: LEGACY_BLOB });
  const lb: BarSetup = { unit: 'lb', barKg: 35, pairs: [{ kg: 45, count: 3 }] };
  await writePlateSetup(store, lb);
  assert.equal(data.get(LEGACY_KEY), LEGACY_BLOB);
  assert.deepEqual(await readPlateSetup(store, 'lb'), lb);
  assert.equal((await readPlateSetup(store, 'kg')).barKg, 15);
});

test('saving a kg setup leaves the pound one alone', async () => {
  const { store } = fakeStore();
  const lb: BarSetup = { unit: 'lb', barKg: 35, pairs: [{ kg: 45, count: 3 }] };
  await writePlateSetup(store, lb);
  await writePlateSetup(store, { barKg: 10, pairs: [{ kg: 5, count: 1 }] });
  assert.deepEqual(await readPlateSetup(store, 'lb'), lb);
  assert.deepEqual(await readPlateSetup(store, 'kg'), { barKg: 10, pairs: [{ kg: 5, count: 1 }] });
});

test('switching units back and forth returns each setup as it was left', async () => {
  const { store } = fakeStore();
  const kg: BarSetup = { barKg: 15, pairs: [{ kg: 25, count: 0 }, { kg: 10, count: 4 }] };
  const lb: BarSetup = { unit: 'lb', barKg: 45, pairs: [{ kg: 45, count: 1 }, { kg: 2.5, count: 0 }] };
  await writePlateSetup(store, kg);
  await writePlateSetup(store, lb);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(await readPlateSetup(store, 'lb'), lb);
    assert.deepEqual(await readPlateSetup(store, 'kg'), kg);
  }
});

test('a setup is filed under its own unit, whatever the caller is showing', async () => {
  const { data, store } = fakeStore();
  await writePlateSetup(store, DEFAULT_LB_BAR_SETUP);
  assert.deepEqual([...data.keys()], [plateSetupKey('lb')]);
});

test('storage being unavailable costs the edit, not the app', async () => {
  assert.deepEqual(await readPlateSetup(brokenStore, 'kg'), DEFAULT_BAR_SETUP);
  assert.deepEqual(await readPlateSetup(brokenStore, 'lb'), DEFAULT_LB_BAR_SETUP);
  await writePlateSetup(brokenStore, DEFAULT_LB_BAR_SETUP);
});
