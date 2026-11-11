/** Run with: npm test — set ids are stored, so they must stay unique across app launches (#158). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('set ids from two app launches never collide', async () => {
  // Each import with a fresh query is a fresh module instance: what a relaunch does.
  const launch1 = await import('./setId.ts?launch=1');
  const launch2 = await import('./setId.ts?launch=2');
  const first = Array.from({ length: 20 }, () => launch1.newSetId());
  const second = Array.from({ length: 20 }, () => launch2.newSetId());
  assert.deepEqual(second.filter((id) => first.includes(id)), [], 'an id from an earlier launch was handed out again');
  assert.equal(new Set(first).size, first.length);
});
