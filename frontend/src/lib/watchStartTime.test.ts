import { test } from 'node:test';
import assert from 'node:assert/strict';

import { watchStartTime, MAX_WATCH_START_AGE_MS, MIN_WATCH_START_AGE_MS } from './watchStartTime.ts';

const now = 1_760_000_000_000;

test('a start the Watch queued out of reach keeps the moment it was tapped', () => {
  const tapped = now - 20 * 60_000;
  assert.equal(watchStartTime({ action: 'startEmpty', startedAt: tapped }, now), tapped);
});

test('a start with no time (an Apple Watch, or an older Wear build) starts now', () => {
  assert.equal(watchStartTime({ action: 'startEmpty' }, now), undefined);
  assert.equal(watchStartTime({ action: 'startRoutine', routineId: 'r' }, now), undefined);
});

test('a time in the future is a clock out of step, so the phone starts now', () => {
  assert.equal(watchStartTime({ action: 'startEmpty', startedAt: now + 5_000 }, now), undefined);
});

test('a start older than the limit is not trusted', () => {
  assert.equal(watchStartTime({ action: 'startEmpty', startedAt: now - MAX_WATCH_START_AGE_MS - 1 }, now), undefined);
  assert.equal(
    watchStartTime({ action: 'startEmpty', startedAt: now - MAX_WATCH_START_AGE_MS }, now),
    now - MAX_WATCH_START_AGE_MS,
  );
});

test('anything that is not a whole number of milliseconds is ignored', () => {
  for (const bad of ['1760000000000', Number.NaN, 1.5, null, -1]) {
    assert.equal(watchStartTime({ action: 'startEmpty', startedAt: bad }, now), undefined);
  }
});

test('a start under a minute old starts now, so watch clock drift never shifts it', () => {
  assert.equal(watchStartTime({ action: 'startEmpty', startedAt: now - 800 }, now), undefined);
  assert.equal(watchStartTime({ action: 'startEmpty', startedAt: now - MIN_WATCH_START_AGE_MS }, now), now - MIN_WATCH_START_AGE_MS);
});
