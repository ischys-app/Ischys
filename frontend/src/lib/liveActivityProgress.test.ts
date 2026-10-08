/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setProgress } from './liveActivityProgress.ts';

const sets = (...done: boolean[]) => ({ sets: done.map((d) => ({ done: d })) });

test('counts done and planned sets across every exercise', () => {
  assert.deepEqual(setProgress([sets(true, true, false), sets(false, false)]), {
    setsDone: 2,
    setsTotal: 5,
  });
});

test('an empty workout has no progress to show', () => {
  assert.deepEqual(setProgress([]), { setsDone: 0, setsTotal: 0 });
  assert.deepEqual(setProgress([sets()]), { setsDone: 0, setsTotal: 0 });
});

test('a finished workout is full', () => {
  assert.deepEqual(setProgress([sets(true), sets(true, true)]), { setsDone: 3, setsTotal: 3 });
});
