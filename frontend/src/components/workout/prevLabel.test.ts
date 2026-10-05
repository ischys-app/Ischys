/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { prevLabel } from './prevLabel.ts';

test('a weighted set reads weight × reps, with no unit', () => {
  // The column header already says KG or LB, and at 390pt the cell is 76pt
  // wide: "102.5 kg × 10" did not fit.
  assert.equal(prevLabel({ kind: 'weighted' }, { prevWeight: '60', prevReps: '8' }), '60 × 8');
  assert.equal(prevLabel({ kind: 'weighted' }, { prevWeight: '102.5', prevReps: '10' }), '102.5 × 10');
});

test('the label is the same whichever unit the weight is in', () => {
  // `prevWeight` is already in the user's unit; 135 lb reads as 135.
  assert.equal(prevLabel({ kind: 'weighted' }, { prevWeight: '135', prevReps: '8' }), '135 × 8');
});

test('a bodyweight set reads × reps', () => {
  assert.equal(prevLabel({ kind: 'bodyweight' }, { prevReps: '11' }), '× 11');
  assert.equal(prevLabel({ kind: 'bodyweight' }, {}), '');
});

test('nothing to refer to reads as nothing', () => {
  assert.equal(prevLabel({ kind: 'weighted' }, {}), '');
  assert.equal(prevLabel({ kind: 'weighted' }, { prevWeight: '60' }), '60 × ');
});
