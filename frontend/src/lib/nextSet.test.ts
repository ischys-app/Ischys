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

// --- supersets: the partners alternate, round by round ---

const s = (id: string, done = false, type = 'normal') => ({ id, done, type });
const grouped = (name: string, group: number | null, ...sets: { id: string; done: boolean; type: string }[]) => ({
  name,
  supersetGroup: group,
  sets,
});

const where = (at: ReturnType<typeof locateNextSet<ReturnType<typeof grouped>>>) =>
  at ? `${at.exercise.name}#${at.setIndex}` : null;

test('after the first partner’s set, the next is the second partner’s, not its own next set', () => {
  const list = [grouped('Curl', 1, s('a1', true), s('a2')), grouped('Press', 1, s('b1'), s('b2'))];
  assert.equal(where(locateNextSet(list)), 'Press#0');
});

test('a closed round goes back to the first partner', () => {
  const list = [grouped('Curl', 1, s('a1', true), s('a2')), grouped('Press', 1, s('b1', true), s('b2'))];
  assert.equal(where(locateNextSet(list)), 'Curl#1');
});

test('treatAsDone moves to the partner at the instant a set is logged', () => {
  const list = [grouped('Curl', 1, s('a1'), s('a2')), grouped('Press', 1, s('b1'), s('b2'))];
  assert.equal(where(locateNextSet(list, 'a1')), 'Press#0');
});

test('warm-ups of the whole superset come before its first round', () => {
  const list = [
    grouped('Curl', 1, s('aw', false, 'warmup'), s('a1')),
    grouped('Press', 1, s('bw', false, 'warmup'), s('b1')),
  ];
  assert.equal(where(locateNextSet(list, 'aw')), 'Press#0');
});

test('a partner with fewer sets drops out of the later rounds', () => {
  const list = [grouped('Curl', 1, s('a1', true), s('a2', true)), grouped('Press', 1, s('b1', true))];
  assert.equal(where(locateNextSet(list)), null);
  const more = [grouped('Curl', 1, s('a1', true), s('a2')), grouped('Press', 1, s('b1', true))];
  assert.equal(where(locateNextSet(more)), 'Curl#1');
});

test('a finished superset hands over to the exercise after it', () => {
  const list = [
    grouped('Curl', 1, s('a1', true)),
    grouped('Press', 1, s('b1', true)),
    grouped('Row', null, s('c1')),
  ];
  assert.equal(where(locateNextSet(list)), 'Row#0');
});

test('partners apart in the list still alternate', () => {
  const list = [
    grouped('Curl', 1, s('a1', true), s('a2')),
    grouped('Row', null, s('c1')),
    grouped('Press', 1, s('b1'), s('b2')),
  ];
  assert.equal(where(locateNextSet(list)), 'Press#0');
});
