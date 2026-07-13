/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { alertBody, shouldSchedule } from './restAlertRules.ts';

test('schedules when alerts are on and rest is in the future', () => {
  assert.equal(shouldSchedule(true, 90), true);
});

test('never schedules when the user turned rest alerts off', () => {
  assert.equal(shouldSchedule(false, 90), false);
});

test('never schedules a zero or negative rest', () => {
  // "Off" is a real rest option (0s), and skipping sets remaining to 0.
  assert.equal(shouldSchedule(true, 0), false);
  assert.equal(shouldSchedule(true, -5), false);
});

test('body names the exercise when we know it', () => {
  assert.equal(alertBody('Barbell Bench Press'), 'Next set: Barbell Bench Press');
});

test('body degrades gracefully with no exercise', () => {
  assert.equal(alertBody(null), 'Time for your next set');
  assert.equal(alertBody(''), 'Time for your next set');
});
