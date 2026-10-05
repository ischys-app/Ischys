/** Run with: npm test */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  claimWatchFinish,
  completesWorkout,
  notifyWatchFinished,
  onWatchFinished,
  releaseAllWatchFinishClaims,
  routeWatchFinish,
} from './watchFinish.ts';

beforeEach(() => releaseAllWatchFinishClaims());

test('routes end to the workout screen while it is mounted', () => {
  claimWatchFinish('w1');
  assert.equal(routeWatchFinish('end', 'w1'), 'screen');
});

test('routes end to the fallback when no screen is mounted', () => {
  assert.equal(routeWatchFinish('end', 'w1'), 'fallback');
});

test('routes end to the fallback when the screen is mounted for a different workout', () => {
  claimWatchFinish('w-other');
  assert.equal(routeWatchFinish('end', 'w1'), 'fallback');
});

test('routes end to the fallback once the screen has unmounted', () => {
  const release = claimWatchFinish('w1');
  release();
  assert.equal(routeWatchFinish('end', 'w1'), 'fallback');
});

test('a stale release does not clear a newer claim', () => {
  const staleRelease = claimWatchFinish('w1');
  claimWatchFinish('w2');
  staleRelease();
  assert.equal(routeWatchFinish('end', 'w2'), 'screen');
});

test('routes discard the same way as end', () => {
  assert.equal(routeWatchFinish('discard', 'w1'), 'fallback');
  claimWatchFinish('w1');
  assert.equal(routeWatchFinish('discard', 'w1'), 'screen');
});

test('ignores actions that do not complete a workout', () => {
  for (const action of ['logSet', 'skipRest', 'addSet', 'requestState', 'startEmpty']) {
    assert.equal(routeWatchFinish(action, 'w1'), 'ignore', action);
  }
});

test('ignores end when no workout is active', () => {
  assert.equal(routeWatchFinish('end', null), 'ignore');
});

test('tells subscribers which workout the fallback finished', () => {
  const seen: string[] = [];
  onWatchFinished((id) => seen.push(id));
  notifyWatchFinished('w1');
  assert.deepEqual(seen, ['w1']);
});

test('stops notifying a subscriber that unsubscribed', () => {
  const seen: string[] = [];
  const off = onWatchFinished((id) => seen.push(id));
  off();
  notifyWatchFinished('w1');
  assert.deepEqual(seen, []);
});

test('one throwing subscriber does not stop the others', () => {
  const seen: string[] = [];
  onWatchFinished(() => {
    throw new Error('screen already unmounted');
  });
  onWatchFinished((id) => seen.push(id));
  notifyWatchFinished('w1');
  assert.deepEqual(seen, ['w1']);
});

test('only Finish and Discard complete a workout', () => {
  assert.equal(completesWorkout('end'), true);
  assert.equal(completesWorkout('discard'), true);
  for (const action of ['logSet', 'requestState', 'workoutSaved', 'addSet', 'startEmpty', '']) {
    assert.equal(completesWorkout(action), false, action);
    // And what the fallback's turn-taking relies on: these never reach a finish.
    assert.equal(routeWatchFinish(action, 'w1'), 'ignore', action);
  }
});
