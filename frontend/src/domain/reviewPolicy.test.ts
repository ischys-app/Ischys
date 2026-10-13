/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldAskForReview, type ReviewAskState } from './reviewPolicy.ts';

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 13, 12);

/** Asked once at the third workout on 4.2, long enough ago and with enough since. */
const state = (over: Partial<ReviewAskState> = {}): ReviewAskState => ({
  count: 13,
  askedAt: NOW - 90 * DAY,
  askedCount: 3,
  askedVersion: '4.2',
  appVersion: '4.3',
  now: NOW,
  ...over,
});

const neverAsked = (count: number): ReviewAskState =>
  state({ count, askedAt: null, askedCount: null, askedVersion: null });

test('first ask waits for the third finished workout', () => {
  assert.equal(shouldAskForReview(neverAsked(2)), false);
  assert.equal(shouldAskForReview(neverAsked(3)), true);
  assert.equal(shouldAskForReview(neverAsked(40)), true);
});

test('asks again on a newer version, 90 days and 10 workouts later', () => {
  assert.equal(shouldAskForReview(state()), true);
});

test('never asks twice on the same version', () => {
  assert.equal(shouldAskForReview(state({ appVersion: '4.2' })), false);
});

test('waits out the 90 days', () => {
  assert.equal(shouldAskForReview(state({ askedAt: NOW - 89 * DAY })), false);
});

test('waits for ten more finished workouts', () => {
  assert.equal(shouldAskForReview(state({ count: 12 })), false);
});

test('an install that asked before the version was recorded can be asked again', () => {
  const migrated = state({ askedVersion: null, askedCount: null });
  assert.equal(shouldAskForReview(migrated), true);
  assert.equal(shouldAskForReview({ ...migrated, count: 12 }), false);
});

test('an unknown app version never triggers a second ask', () => {
  assert.equal(shouldAskForReview(state({ appVersion: '' })), false);
});
