/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { elapsedSeconds, restRemainingSeconds } from './clocks.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

test('elapsed counts from the workout start', () => {
  const started = 1_000_000;
  assert.equal(elapsedSeconds(started, started + 90 * SECOND), 90);
});

test('elapsed does NOT lose time the app spent suspended', () => {
  // The old counter incremented once per tick, so 20 minutes backgrounded read
  // as 0 seconds elapsed. Deriving from the start makes that impossible.
  const started = 1_000_000;
  const twentyMinutesLater = started + 20 * MINUTE;
  assert.equal(elapsedSeconds(started, twentyMinutesLater), 1200);
});

test('elapsed never goes negative when clocks disagree', () => {
  const started = 1_000_000;
  assert.equal(elapsedSeconds(started, started - 5 * SECOND), 0);
});

test('elapsed rounds to the nearest second', () => {
  const started = 1_000_000;
  assert.equal(elapsedSeconds(started, started + 1400), 1);
  assert.equal(elapsedSeconds(started, started + 1600), 2);
});

test('rest counts down to the end timestamp', () => {
  const now = 1_000_000;
  assert.equal(restRemainingSeconds(now + 90 * SECOND, now), 90);
});

test('rest rounds up, so it never reads 0 while a second is still running', () => {
  const now = 1_000_000;
  assert.equal(restRemainingSeconds(now + 200, now), 1);
  assert.equal(restRemainingSeconds(now + 1001, now), 2);
});

test('an expired rest is 0, not negative', () => {
  const now = 1_000_000;
  assert.equal(restRemainingSeconds(now - 30 * SECOND, now), 0);
});

test('rest is 0 exactly at the end', () => {
  const now = 1_000_000;
  assert.equal(restRemainingSeconds(now, now), 0);
});

test('a rest survives the app being suspended past its end', () => {
  const now = 1_000_000;
  const endsAt = now + 60 * SECOND;
  // Away for five minutes: the rest is over, not "60 seconds left" as a paused
  // counter would have claimed on resume.
  assert.equal(restRemainingSeconds(endsAt, now + 5 * MINUTE), 0);
});
