/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { groupLabels, restAfterSet, roundOfSet, supersetPartners, withoutLoneGroups } from './supersets.ts';

type S = { id: string; type: string; done: boolean };
const set = (id: string, type = 'normal', done = false): S => ({ id, type, done });

const ex = (id: string, group: number | null, rest: number, sets: S[]) => ({
  id,
  supersetGroup: group,
  rest,
  sets,
});

// --- labels ---

test('groups are lettered in the order they first appear', () => {
  const labels = groupLabels([
    ex('a', 3, 90, []),
    ex('b', 3, 90, []),
    ex('c', null, 90, []),
    ex('d', 7, 60, []),
  ]);
  assert.equal(labels.get(3), 'A');
  assert.equal(labels.get(7), 'B');
  assert.equal(labels.get(99), undefined);
});

// --- rounds ---

test('a round is the Nth working set', () => {
  const sets = [set('s1'), set('s2'), set('s3')];
  assert.equal(roundOfSet(sets, 's1'), 1);
  assert.equal(roundOfSet(sets, 's2'), 2);
  assert.equal(roundOfSet(sets, 's3'), 3);
});

test('warm-ups belong to no round', () => {
  const sets = [set('w', 'warmup'), set('s1')];
  assert.equal(roundOfSet(sets, 'w'), null);
  assert.equal(roundOfSet(sets, 's1'), 1, 'the warm-up must not consume a round');
});

test('a drop or failure set rides along with the working set before it', () => {
  const sets = [set('s1'), set('d', 'drop'), set('s2'), set('f', 'failure')];
  assert.equal(roundOfSet(sets, 'd'), 1);
  assert.equal(roundOfSet(sets, 's2'), 2);
  assert.equal(roundOfSet(sets, 'f'), 2);
});

test('a drop set with nothing before it still counts as the first round', () => {
  assert.equal(roundOfSet([set('d', 'drop')], 'd'), 1);
});

// --- partners ---

test('partners are the other exercises in the same group, in order', () => {
  const list = [ex('a', 3, 90, []), ex('b', 3, 90, []), ex('c', null, 60, [])];
  assert.deepEqual(supersetPartners(list, 'a').map((e) => e.id), ['a', 'b']);
  assert.deepEqual(supersetPartners(list, 'c').map((e) => e.id), ['c']);
});

// --- rest ---

const pair = () => [
  ex('a', 3, 60, [set('a1'), set('a2')]),
  ex('b', 3, 120, [set('b1'), set('b2')]),
];

test('finishing the first partner starts no rest — you move straight to the next', () => {
  const r = restAfterSet(pair(), 'a', 'a1');
  assert.equal(r.startRest, false);
  assert.equal(r.nextExerciseId, 'b');
});

test('rest fires once the round is done, owned by the last partner', () => {
  const r = restAfterSet(pair(), 'b', 'b1');
  assert.equal(r.startRest, true);
  assert.equal(r.seconds, 120, "the last partner's rest, not the first's");
  assert.equal(r.nextExerciseId, 'a', 'the next round starts back at the top');
});

test('an exercise on its own rests after every set, as before', () => {
  const solo = [ex('c', null, 90, [set('c1'), set('c2')])];
  const r = restAfterSet(solo, 'c', 'c1');
  assert.equal(r.startRest, true);
  assert.equal(r.seconds, 90);
  assert.equal(r.nextExerciseId, null);
});

test('with uneven sets, the last partner still holding a set in that round owns the rest', () => {
  // B has only one set, so round 2 ends on A.
  const uneven = [
    ex('a', 3, 60, [set('a1'), set('a2')]),
    ex('b', 3, 120, [set('b1')]),
  ];
  const r = restAfterSet(uneven, 'a', 'a2');
  assert.equal(r.startRest, true);
  assert.equal(r.seconds, 60, 'B has nothing in round 2, so A closes it');
});

test('a warm-up inside a superset rests normally and hands off to nobody', () => {
  const withWarmup = [
    ex('a', 3, 60, [set('w', 'warmup'), set('a1')]),
    ex('b', 3, 120, [set('b1')]),
  ];
  const r = restAfterSet(withWarmup, 'a', 'w');
  assert.equal(r.startRest, true, 'warm-ups are not part of a round');
  assert.equal(r.seconds, 60);
});

test('a superset left with one exercise is no longer one', () => {
  const out = withoutLoneGroups([
    { id: 'a', supersetGroup: 1 },
    { id: 'b', supersetGroup: 2 },
    { id: 'c', supersetGroup: 2 },
    { id: 'd', supersetGroup: null },
  ]);
  assert.deepEqual(
    out.map((e) => e.supersetGroup),
    [null, 2, 2, null],
  );
});

test('intact supersets keep their groups and the rest of each exercise', () => {
  const input = [
    { id: 'a', supersetGroup: 3, rest: 90 },
    { id: 'b', supersetGroup: 3, rest: 60 },
  ];
  assert.deepEqual(withoutLoneGroups(input), input);
});
