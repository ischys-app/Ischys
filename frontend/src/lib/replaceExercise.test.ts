/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { replaceOrder, swapExercise } from './replaceExercise.ts';

const legPress = {
  id: 'we-2',
  exerciseCatalogId: 'cat-legpress',
  name: 'Leg Press Horizontal (Machine)',
  initials: 'LP',
  equipment: 'machine',
  kind: 'weighted' as const,
  rest: 180,
  note: 'knees out',
  sets: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
};

const hackSquat = {
  id: 'cat-hacksquat',
  name: 'Hack Squat',
  initials: 'HS',
  equipment: 'machine',
  kind: 'weighted' as const,
};

test('the newcomer takes the old exercise’s slot, not the end of the list', () => {
  const order = replaceOrder(['we-1', 'we-2', 'we-3'], 'we-2', 'we-new');
  assert.deepEqual(order, ['we-1', 'we-new', 'we-3']);
});

test('replacing the first exercise keeps it first', () => {
  assert.deepEqual(replaceOrder(['a', 'b'], 'a', 'z'), ['z', 'b']);
});

test('replacing the last exercise keeps it last', () => {
  assert.deepEqual(replaceOrder(['a', 'b'], 'b', 'z'), ['a', 'z']);
});

test('an unknown target leaves the order untouched, never scrambled', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(replaceOrder(ids, 'gone', 'z'), ['a', 'b', 'c']);
});

test('the swap keeps the row id, so the list does not jump before the refetch', () => {
  const next = swapExercise(legPress, hackSquat, { id: 'fresh' });
  assert.equal(next.id, 'we-2');
});

test('the swap points at the new catalog exercise', () => {
  const next = swapExercise(legPress, hackSquat, { id: 'fresh' });
  assert.equal(next.exerciseCatalogId, 'cat-hacksquat');
  assert.equal(next.name, 'Hack Squat');
  assert.equal(next.initials, 'HS');
  assert.equal(next.kind, 'weighted');
});

test('rest carries over — it belongs to the slot, not the movement', () => {
  assert.equal(swapExercise(legPress, hackSquat, { id: 'fresh' }).rest, 180);
});

test('sets and note do not carry over — they described another exercise', () => {
  const next = swapExercise(legPress, hackSquat, { id: 'fresh' });
  assert.deepEqual(next.sets, [{ id: 'fresh' }]);
  assert.equal(next.note, '');
});

test('a bodyweight exercise replacing a weighted one changes kind', () => {
  const pullUp = {
    id: 'cat-pullup',
    name: 'Pull Up',
    initials: 'PU',
    equipment: 'bodyweight',
    kind: 'bodyweight' as const,
  };
  assert.equal(swapExercise(legPress, pullUp, { id: 'fresh' }).kind, 'bodyweight');
});
