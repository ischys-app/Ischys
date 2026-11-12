import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dropIndex, fullOrder, moveItem, shiftFor, stepIndex } from './reorder.ts';

test('dropIndex: rounds to the nearest slot and clamps to the list', () => {
  assert.equal(dropIndex(0, 34, 70, 3), 0);
  assert.equal(dropIndex(0, 36, 70, 3), 1);
  assert.equal(dropIndex(2, -140, 70, 3), 0);
  assert.equal(dropIndex(1, 9999, 70, 3), 2);
  assert.equal(dropIndex(1, -9999, 70, 3), 0);
});

test('moveItem: moves down, up, and leaves the input alone', () => {
  const a = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(a, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(a, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(a, 1, 1), a);
  assert.notEqual(moveItem(a, 1, 1), a);
  assert.deepEqual(a, ['a', 'b', 'c', 'd']);
});

test('shiftFor: only the rows between from and to make room', () => {
  // Dragging row 1 down over row 3: rows 2 and 3 move up a slot.
  assert.deepEqual([0, 2, 3, 4].map((j) => shiftFor(j, 1, 3, 70)), [0, -70, -70, 0]);
  // Dragging row 3 up over row 1: rows 1 and 2 move down a slot.
  assert.deepEqual([0, 1, 2, 4].map((j) => shiftFor(j, 3, 1, 70)), [0, 70, 70, 0]);
  // Held over its own slot: nothing moves.
  assert.deepEqual([0, 2].map((j) => shiftFor(j, 1, 1, 70)), [0, 0]);
});

test('stepIndex: one place up or down, null past either end', () => {
  assert.equal(stepIndex(1, 'moveUp', 3), 0);
  assert.equal(stepIndex(1, 'moveDown', 3), 2);
  assert.equal(stepIndex(0, 'moveUp', 3), null);
  assert.equal(stepIndex(2, 'moveDown', 3), null);
});

test('fullOrder: the requested order when it names every stored id', () => {
  assert.deepEqual(fullOrder(['a', 'b', 'c'], ['c', 'a', 'b']), ['c', 'a', 'b']);
});

test('fullOrder: drops unknown and repeated ids, appends the ones left out in stored order', () => {
  assert.deepEqual(fullOrder(['a', 'b', 'c', 'd'], ['x', 'c', 'c', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(fullOrder(['a', 'b'], []), ['a', 'b']);
  assert.deepEqual(fullOrder([], ['a']), []);
});
