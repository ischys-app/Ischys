/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { restAfterSet } from '../domain/supersets.ts';
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

test('partners logged as failure sets alternate too', () => {
  // The Watch showed the first partner's next set after logging its first
  // one: every failure set sat in round 1, so the tie kept the first partner.
  const list = [
    grouped('Press', 1, s('aw', true, 'warmup'), s('a1', true, 'failure'), s('a2', false, 'failure')),
    grouped('Dips', 1, s('b1', false, 'failure'), s('b2', false, 'failure')),
  ];
  assert.equal(where(locateNextSet(list)), 'Dips#0');
  assert.equal(where(locateNextSet(list, 'b1')), 'Press#2');
});

// The look-ahead (what the Watch and the card offer next) and the rest
// hand-off (what the in-app ✓ does) must name the same partner after a set.
const agree = (list: ReturnType<typeof grouped>[], exName: string, setId: string) => {
  const view = list.map((e) => ({ id: e.name, supersetGroup: e.supersetGroup, rest: 60, sets: e.sets }));
  const handOff = restAfterSet(view, exName, setId);
  const next = locateNextSet(list, setId);
  if (!handOff.startRest) assert.equal(next?.exercise.name, handOff.nextExerciseId, 'hand-off and look-ahead disagree');
  return where(next);
};

test('a trailing failure set is a round of its own, so the partner still gets its turn', () => {
  const list = [
    grouped('Curl', 1, s('a1', true), s('a2'), s('af', false, 'failure')),
    grouped('Press', 1, s('b1', true), s('b2'), s('b3')),
  ];
  assert.equal(agree(list, 'Curl', 'a2'), 'Press#1');
  list[0].sets[1].done = true;
  list[1].sets[1].done = true;
  assert.equal(where(locateNextSet(list)), 'Curl#2', 'round 3 starts with the failure set');
  assert.equal(agree(list, 'Curl', 'af'), 'Press#2');
});

test('normal sets followed by a failure set alongside a normal-only partner', () => {
  // A = N,F and B = N,N,N: three rounds, A sits the third out.
  const list = [
    grouped('Curl', 1, s('a1'), s('af', false, 'failure')),
    grouped('Press', 1, s('b1'), s('b2'), s('b3')),
  ];
  const order: (string | null)[] = [];
  for (let at = locateNextSet(list); at; at = locateNextSet(list)) {
    const id = at.exercise.sets[at.setIndex].id;
    order.push(agree(list, at.exercise.name, id));
    at.exercise.sets[at.setIndex].done = true;
  }
  assert.deepEqual(order, ['Press#0', 'Curl#1', 'Press#1', 'Press#2', null]);
});

test('a normal set added to a failure-only partner keeps the alternation', () => {
  // Add Set always adds a normal set; it used to fold the failure sets into
  // round 1 and offer them back to back.
  const list = [
    grouped('Press', 1, s('a1', true, 'failure'), s('a2', false, 'failure'), s('an')),
    grouped('Dips', 1, s('b1', false, 'failure'), s('b2', false, 'failure'), s('b3', false, 'failure')),
  ];
  assert.equal(where(locateNextSet(list)), 'Dips#0');
  assert.equal(agree(list, 'Press', 'a1'), 'Dips#0');
  list[1].sets[0].done = true;
  assert.equal(agree(list, 'Press', 'a2'), 'Dips#1');
});

test('a normal-only superset alternates exactly as before', () => {
  const list = [grouped('Curl', 1, s('a1'), s('a2')), grouped('Press', 1, s('b1'), s('b2'))];
  const order: (string | null)[] = [];
  for (let at = locateNextSet(list); at; at = locateNextSet(list)) {
    order.push(`${at.exercise.name}#${at.setIndex}`);
    agree(list, at.exercise.name, at.exercise.sets[at.setIndex].id);
    at.exercise.sets[at.setIndex].done = true;
  }
  assert.deepEqual(order, ['Curl#0', 'Press#0', 'Curl#1', 'Press#1']);
});
