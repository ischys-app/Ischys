/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWatchState } from './watchState.ts';

const set = (id: string, weight: string, reps: string, done = false, type = 'normal') => ({
  id,
  type,
  weight,
  reps,
  done,
});

const resolve = (sets: ReturnType<typeof set>[], index: number) => {
  const back = (pick: 'weight' | 'reps') => {
    for (let i = index; i >= 0; i--) if (sets[i][pick].trim() !== '') return sets[i][pick];
    return '';
  };
  return { weight: back('weight'), reps: back('reps') };
};

const rest = { resting: false, remaining: 0, total: 0 };

const legPress = (...sets: ReturnType<typeof set>[]) => [
  { id: 'we-1', name: 'Leg Press', equipment: 'Machine', rest: 120, sets },
];

test('points at the first unfinished set with its ids', () => {
  const s = buildWatchState(
    legPress(set('a', '154', '12', true), set('b', '154', '12')),
    'Temp Upper',
    rest,
    resolve,
  );
  assert.equal(s?.setNum, 2);
  assert.equal(s?.setCount, 2);
  assert.equal(s?.currentExerciseId, 'we-1');
  assert.equal(s?.currentSetId, 'b');
});

test('set dots mark done / active / pending', () => {
  const s = buildWatchState(
    legPress(set('a', '1', '1', true), set('b', '1', '1'), set('c', '', '')),
    'R',
    rest,
    resolve,
  );
  assert.deepEqual(s?.setDots, ['done', 'active', 'pending']);
});

test('carries the numbers forward for the active set', () => {
  const s = buildWatchState(
    legPress(set('a', '154', '12', true), set('b', '', '')),
    'R',
    rest,
    resolve,
  );
  assert.equal(s?.weight, '154');
  assert.equal(s?.reps, '12');
});

test('volume and set counts cover done, non-warmup sets only', () => {
  const s = buildWatchState(
    legPress(
      set('w', '40', '10', true, 'warmup'),
      set('a', '100', '5', true),
      set('b', '100', '5', true),
      set('c', '100', '5'),
    ),
    'R',
    rest,
    resolve,
  );
  assert.equal(s?.volumeKg, 1000); // 2 working sets × 100 × 5; warmup excluded
  assert.equal(s?.setsDone, 2);
  assert.equal(s?.setsTotal, 4);
});

test('the next-set label never runs past the last set', () => {
  const s = buildWatchState(legPress(set('a', '1', '1'), set('b', '1', '1')), 'R', rest, resolve);
  assert.equal(s?.nextSetLabel, 'Next: Set 2');
  const last = buildWatchState(
    legPress(set('a', '1', '1', true), set('b', '1', '1')),
    'R',
    rest,
    resolve,
  );
  assert.equal(last?.nextSetLabel, 'Next: Set 2');
});

test('rest state passes through', () => {
  const s = buildWatchState(
    legPress(set('a', '1', '1', true), set('b', '1', '1')),
    'R',
    { resting: true, remaining: 45, total: 90 },
    resolve,
  );
  assert.equal(s?.resting, true);
  assert.equal(s?.restRemaining, 45);
  assert.equal(s?.restTotal, 90);
});

test('the next exercise becomes current once one is fully done', () => {
  const s = buildWatchState(
    [
      { id: 'e1', name: 'Squat', equipment: 'Barbell', rest: 180, sets: [set('a', '100', '5', true)] },
      { id: 'e2', name: 'Bench', equipment: 'Barbell', rest: 120, sets: [set('b', '80', '5')] },
    ],
    'R',
    rest,
    resolve,
  );
  assert.equal(s?.exerciseName, 'Bench');
  assert.equal(s?.currentExerciseId, 'e2');
});

test('null once every set is done', () => {
  const s = buildWatchState(legPress(set('a', '1', '1', true)), 'R', rest, resolve);
  assert.equal(s, null);
});
