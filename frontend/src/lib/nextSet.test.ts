/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { locateNextSet } from './nextSet.ts';

const set = (id: string, done = false) => ({ id, done });
const ex = (name: string, ...sets: { id: string; done: boolean }[]) => ({ name, sets });

test('finds the first unfinished set of the first exercise', () => {
  const at = locateNextSet([ex('Squat', set('a', true), set('b'), set('c'))]);
  assert.equal(at?.exercise.name, 'Squat');
  assert.equal(at?.exerciseIndex, 0);
  assert.equal(at?.setIndex, 1);
});

test('skips an exercise whose sets are all done', () => {
  const at = locateNextSet([
    ex('Squat', set('a', true), set('b', true)),
    ex('Bench', set('c')),
  ]);
  assert.equal(at?.exercise.name, 'Bench');
  assert.equal(at?.exerciseIndex, 1);
  assert.equal(at?.setIndex, 0);
});

test('skips an exercise that has no sets at all', () => {
  const at = locateNextSet([ex('Empty'), ex('Bench', set('c'))]);
  assert.equal(at?.exercise.name, 'Bench');
  assert.equal(at?.exerciseIndex, 1);
});

test('null once every set is done', () => {
  assert.equal(locateNextSet([ex('Squat', set('a', true))]), null);
});

test('null for an empty workout', () => {
  assert.equal(locateNextSet([]), null);
});

// --- treatAsDone: answering at the instant a set is completed ---

test('treatAsDone advances within the same exercise', () => {
  const at = locateNextSet([ex('Squat', set('a'), set('b'))], 'a');
  assert.equal(at?.exercise.name, 'Squat');
  assert.equal(at?.setIndex, 1);
});

test('treatAsDone crosses into the next exercise after an exercise’s LAST set', () => {
  // The #19/#20 case: completing the last set of A must point at B, set 1 —
  // not back at a set of A.
  const at = locateNextSet(
    [ex('Squat', set('a', true), set('b')), ex('Bench', set('c'), set('d'))],
    'b',
  );
  assert.equal(at?.exercise.name, 'Bench');
  assert.equal(at?.exerciseIndex, 1);
  assert.equal(at?.setIndex, 0);
});

test('treatAsDone skips over an exercise that is now fully accounted for', () => {
  const at = locateNextSet(
    [ex('Squat', set('a', true), set('b')), ex('Empty'), ex('Bench', set('c'))],
    'b',
  );
  assert.equal(at?.exercise.name, 'Bench');
  assert.equal(at?.exerciseIndex, 2);
});

test('treatAsDone on the workout’s very last set leaves nothing next', () => {
  const at = locateNextSet([ex('Squat', set('a', true), set('b'))], 'b');
  assert.equal(at, null);
});

test('a set left unfinished ABOVE the completed one is still what comes next', () => {
  // Skipping a set does not remove it from the workout; it is the first thing
  // outstanding, so it is what the user is sent back to.
  const at = locateNextSet([ex('Squat', set('a'), set('b'))], 'b');
  assert.equal(at?.setIndex, 0);
});

test('an unknown treatAsDone id changes nothing', () => {
  const at = locateNextSet([ex('Squat', set('a'), set('b'))], 'nope');
  assert.equal(at?.setIndex, 0);
});
