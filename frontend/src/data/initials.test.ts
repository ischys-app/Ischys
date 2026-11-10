/** Run with: npm test — avatar initials keep Greek capitals tonos-free. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { initialsOf } from './initials.ts';

test('initialsOf drops the tonos on an all-Greek name', () => {
  assert.equal(initialsOf('Άρση θανάτου'), 'ΑΡ');
  assert.equal(initialsOf('Incline Bench Press'), 'IB');
});
