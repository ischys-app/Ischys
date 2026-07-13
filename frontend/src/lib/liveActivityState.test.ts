/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLiveActivityState } from './liveActivityState.ts';

const set = (id: string, weight: string, reps: string, done = false) => ({
  id,
  weight,
  reps,
  done,
});

const legPress = (...sets: ReturnType<typeof set>[]) => [
  { name: 'Leg Press Horizontal (Machine)', rest: 120, sets },
];

/** Stands in for setCarry.ts: an empty field carries from the nearest set above. */
const resolve = (sets: readonly ReturnType<typeof set>[], index: number) => {
  const back = (pick: 'weight' | 'reps') => {
    for (let i = index; i >= 0; i--) if (sets[i][pick].trim() !== '') return sets[i][pick];
    return '';
  };
  return { weight: back('weight'), reps: back('reps') };
};

test('logging mode points at the first unfinished set', () => {
  const s = buildLiveActivityState(legPress(set('a', '154', '12', true), set('b', '154', '12')), false, resolve);
  assert.equal(s?.mode, 'logging');
  assert.equal(s?.subtitle, 'Set 2 of 2');
  assert.equal(s?.weightLabel, '154 kg');
  assert.equal(s?.repsLabel, '12 reps');
  assert.equal(s?.setId, 'b');
});

test('rest mode describes the set you are about to do', () => {
  const s = buildLiveActivityState(legPress(set('a', '154', '12', true), set('b', '154', '12'), set('c', '', '')), true, resolve);
  assert.equal(s?.mode, 'rest');
  assert.equal(s?.subtitle, 'Next: set 2 of 3 (154 kg × 12 reps)');
});

test('the separator is U+00D7, not the letter x', () => {
  const s = buildLiveActivityState(legPress(set('a', '100', '5', true), set('b', '100', '5')), true, resolve);
  assert.ok(s!.subtitle.includes('×'));
  assert.ok(!s!.subtitle.includes(' x '));
});

test('an untyped set carries the numbers down from the set above', () => {
  const s = buildLiveActivityState(legPress(set('a', '154', '12', true), set('b', '', '')), false, resolve);
  assert.equal(s?.weightLabel, '154 kg');
  assert.equal(s?.repsLabel, '12 reps');
});

test('a bodyweight set shows a dash rather than an empty unit', () => {
  const s = buildLiveActivityState([{ name: 'Pull Up', rest: 90, sets: [set('a', '', '8')] }], false, resolve);
  assert.equal(s?.weightLabel, '—');
  assert.equal(s?.repsLabel, '8 reps');
});

test('skips a finished exercise and moves to the next', () => {
  const s = buildLiveActivityState([
      { name: 'Squat', rest: 180, sets: [set('a', '100', '5', true)] },
      { name: 'Bench', rest: 90, sets: [set('b', '80', '5')] },
    ], false, resolve);
  assert.equal(s?.exerciseName, 'Bench');
  assert.equal(s?.subtitle, 'Set 1 of 1');
});

test('returns null once every set is done, so the caller can end the Activity', () => {
  const s = buildLiveActivityState(legPress(set('a', '154', '12', true)), false, resolve);
  assert.equal(s, null);
});

test('carries the rest duration of the exercise the current set belongs to', () => {
  const s = buildLiveActivityState(
    [
      { name: 'Squat', rest: 180, sets: [set('a', '100', '5', true)] },
      { name: 'Bench', rest: 90, sets: [set('b', '80', '5')] },
    ],
    false,
    resolve,
  );
  assert.equal(s?.restSeconds, 90);
});

test('describes the set after this one, so the card can redraw without JS', () => {
  const s = buildLiveActivityState(
    legPress(set('a', '154', '12'), set('b', '160', '10')),
    false,
    resolve,
  );
  assert.equal(s?.setId, 'a');
  assert.equal(s?.next?.setId, 'b');
  assert.equal(s?.next?.subtitle, 'Next: set 2 of 2 (160 kg × 10 reps)');
});

test('the next set can live in the following exercise', () => {
  const s = buildLiveActivityState(
    [
      { name: 'Squat', rest: 180, sets: [set('a', '100', '5')] },
      { name: 'Bench', rest: 90, sets: [set('b', '80', '5')] },
    ],
    false,
    resolve,
  );
  assert.equal(s?.next?.exerciseName, 'Bench');
  assert.equal(s?.next?.setId, 'b');
});

test('the workout’s last set has no next', () => {
  const s = buildLiveActivityState(legPress(set('a', '154', '12')), false, resolve);
  assert.equal(s?.next, undefined);
});
