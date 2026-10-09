/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { doneToggleLabel, repsFieldLabel, weightFieldLabel } from './setRowLabels.ts';

test('each field names its set and what is typed in it', () => {
  assert.equal(weightFieldLabel('2', 'lb'), 'Weight in lb, set 2');
  assert.equal(weightFieldLabel('W', 'kg'), 'Weight in kg, set W');
  assert.equal(repsFieldLabel('2'), 'Reps, set 2');
});

test('two rows never read the same', () => {
  assert.notEqual(weightFieldLabel('1', 'kg'), weightFieldLabel('2', 'kg'));
  assert.notEqual(repsFieldLabel('1'), repsFieldLabel('2'));
  assert.notEqual(doneToggleLabel('1', false), doneToggleLabel('2', false));
});

test('the tick says what a tap will do', () => {
  assert.equal(doneToggleLabel('3', false), 'Complete set 3');
  assert.equal(doneToggleLabel('3', true), 'Mark set 3 not done');
});
