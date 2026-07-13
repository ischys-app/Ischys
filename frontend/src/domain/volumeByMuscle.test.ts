/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { volumeByMuscle } from './volumeByMuscle.ts';

const s = (type: string, weight: number | null, reps: number | null, done = true) => ({
  type,
  weight,
  reps,
  done,
});

test('aggregates working sets per muscle label, warmups/undone excluded', () => {
  const out = volumeByMuscle([
    { muscleLabel: 'Chest', sets: [s('normal', 60, 8), s('warmup', 30, 10), s('normal', 65, 5)] },
    { muscleLabel: 'Back', sets: [s('normal', 40, 10, false)] }, // undone -> 0
    { muscleLabel: 'Chest', sets: [s('normal', 70, 5)] },
  ]);
  assert.deepEqual(out, [
    { name: 'Chest', sets: 3 },
    { name: 'Back', sets: 0 },
  ]);
});

test('sorted by set count descending', () => {
  const out = volumeByMuscle([
    { muscleLabel: 'Legs', sets: [s('normal', 100, 5)] },
    { muscleLabel: 'Chest', sets: [s('normal', 60, 8), s('normal', 60, 8), s('normal', 60, 8)] },
  ]);
  assert.deepEqual(out.map((m) => m.name), ['Chest', 'Legs']);
});

test('empty input yields empty breakdown', () => {
  assert.deepEqual(volumeByMuscle([]), []);
});
