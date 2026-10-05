/** Run with: npm test */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  claimWatchFinish,
  completesWorkout,
  finishRequestId,
  finishVerdict,
  notifyWatchFinished,
  onWatchFinished,
  releaseAllWatchFinishClaims,
  routeWatchFinish,
  WATCH_VERDICT_TIMEOUT_MS,
  watchSaveWaitMs,
  withFinishVerdict,
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

// --- the finish handshake (#95) ----------------------------------------------

test('a Finish from a Watch that waits for the outcome carries its request id', () => {
  assert.equal(finishRequestId({ action: 'end', finishId: 'f1' }), 'f1');
});

test('a Finish from a Watch that does not wait has no request id', () => {
  // A Watch build from before the handshake, or one that could not reach the
  // phone and has already ended and saved.
  assert.equal(finishRequestId({ action: 'end' }), null);
  assert.equal(finishRequestId({ action: 'end', finishId: '' }), null);
  assert.equal(finishRequestId({ action: 'end', finishId: 7 }), null);
});

test('only a Finish is ever answered', () => {
  assert.equal(finishRequestId({ action: 'discard', finishId: 'f1' }), null);
  assert.equal(finishRequestId({ action: 'logSet', finishId: 'f1' }), null);
});

test('the outcome names the request it answers', () => {
  assert.deepEqual(finishVerdict('finished', 'f1'), { finishVerdict: 'finished', finishId: 'f1' });
  assert.deepEqual(finishVerdict('failed', 'f1'), { finishVerdict: 'failed', finishId: 'f1' });
});

test('a Watch that is not waiting is sent no outcome', () => {
  assert.equal(finishVerdict('finished', null), null);
  assert.equal(finishVerdict('failed', null), null);
});

test('a failed finish sends the outcome with the state that puts the Watch back', () => {
  const state = { screen: 'session', exerciseName: 'Squat' };
  assert.deepEqual(withFinishVerdict(state, 'failed', 'f1'), {
    screen: 'session',
    exerciseName: 'Squat',
    finishVerdict: 'failed',
    finishId: 'f1',
  });
  // The state it was given is what later pushes reuse: it must not be marked.
  assert.deepEqual(state, { screen: 'session', exerciseName: 'Squat' });
});

test('a Watch that is not waiting gets the state alone, as before', () => {
  const state = { screen: 'session' };
  assert.equal(withFinishVerdict(state, 'failed', null), state);
  assert.equal(withFinishVerdict(null, 'failed', null), null);
});

test('with no state to show, a waiting Watch still gets the outcome', () => {
  assert.deepEqual(withFinishVerdict(null, 'failed', 'f1'), {
    finishVerdict: 'failed',
    finishId: 'f1',
  });
});

test('the phone outwaits a Watch that is itself waiting for the outcome', () => {
  // The Watch saves only after the outcome reaches it, or after giving up on
  // one. Its confirmation must still land inside the phone's wait, or the
  // phone writes a second Health entry.
  assert.equal(watchSaveWaitMs(false), 10_000);
  assert.ok(watchSaveWaitMs(true) >= WATCH_VERDICT_TIMEOUT_MS + 10_000);
});
