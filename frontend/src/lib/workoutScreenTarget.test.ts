/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { workoutScreenTarget } from './workoutScreenTarget.ts';

test('a workout in progress opens', () => {
  assert.equal(workoutScreenTarget('active'), 'workout');
});

test('a finished workout opens as its summary, not as one still running', () => {
  assert.equal(workoutScreenTarget('completed'), 'summary');
});

test('an id with no workout behind it opens nothing', () => {
  // The stale remembered id, or a bad link: this used to open a made-up workout.
  assert.equal(workoutScreenTarget(null), 'leave');
});

test('a discarded workout opens nothing', () => {
  assert.equal(workoutScreenTarget('discarded'), 'leave');
  assert.equal(workoutScreenTarget('something-else'), 'leave');
});
