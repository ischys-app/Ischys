/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  effortAddLabel,
  effortAsk,
  effortHint,
  effortLabel,
  effortLastLabel,
  effortMeaning,
  effortRowLine,
  effortSavedLabel,
  effortSentence,
  effortSteps,
  effortValue,
  isEffortMode,
  normalizeRpe,
  releasedStep,
  selectedStep,
  shouldPromptEffort,
  stepAt,
} from './effort.ts';

// --- storage -----------------------------------------------------------

test('normalizeRpe keeps a rating on the half-step grid', () => {
  assert.equal(normalizeRpe(8), 8);
  assert.equal(normalizeRpe(8.5), 8.5);
  assert.equal(normalizeRpe(10), 10);
  assert.equal(normalizeRpe(7.3), 7.5);
  assert.equal(normalizeRpe(3), 3); // other trackers rate below 6; kept, not clipped
});

test('normalizeRpe drops what is not a rating', () => {
  assert.equal(normalizeRpe(null), null);
  assert.equal(normalizeRpe(undefined), null);
  assert.equal(normalizeRpe(Number.NaN), null);
  assert.equal(normalizeRpe(0), null);
  assert.equal(normalizeRpe(-2), null);
  assert.equal(normalizeRpe(11), null);
  assert.equal(normalizeRpe('8' as unknown as number), null);
});

test('isEffortMode accepts only the three settings', () => {
  assert.equal(isEffortMode('off'), true);
  assert.equal(isEffortMode('rpe'), true);
  assert.equal(isEffortMode('rir'), true);
  assert.equal(isEffortMode('RPE'), false);
  assert.equal(isEffortMode(null), false);
});

// --- scale steps -------------------------------------------------------

test('RPE runs 6 to 10 in half steps, harder on the right', () => {
  const steps = effortSteps('rpe');
  assert.deepEqual(steps.map((s) => s.label), ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10']);
  assert.deepEqual(steps.map((s) => s.rpe), [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
  assert.deepEqual(steps.map((s) => s.half), [false, true, false, true, false, true, false, true, false]);
});

test('RIR runs 5+ down to 0, so nothing-left is on the right too', () => {
  const steps = effortSteps('rir');
  assert.deepEqual(steps.map((s) => s.label), ['5+', '4', '3', '2', '1', '0']);
  // Always stored as RPE: 5+ is 5, 0 reps left is 10.
  assert.deepEqual(steps.map((s) => s.rpe), [5, 6, 7, 8, 9, 10]);
  assert.equal(steps.some((s) => s.half), false);
});

test('stepAt maps a touch to a cell and clamps past either end', () => {
  // Nine cells across 342pt: 38pt each.
  assert.equal(stepAt(0, 342, 9), 0);
  assert.equal(stepAt(37.9, 342, 9), 0);
  assert.equal(stepAt(38, 342, 9), 1);
  assert.equal(stepAt(341, 342, 9), 8);
  assert.equal(stepAt(-20, 342, 9), 0);
  assert.equal(stepAt(900, 342, 9), 8);
  assert.equal(stepAt(10, 0, 9), 0); // not laid out yet
});

test('releasedStep commits only when a finger really lifted', () => {
  const on = { active: 4, y: 20, height: 44, slop: 40 };
  // A drag that ended, and a plain tap (never a drag, but the finger came up).
  assert.equal(releasedStep({ ...on, end: 'ended', fingerUp: true }), 4);
  assert.equal(releasedStep({ ...on, end: 'failed', fingerUp: true }), 4);
  // A drag's end is a lift even if the lift itself was not reported first.
  assert.equal(releasedStep({ ...on, end: 'ended', fingerUp: false }), 4);
  // Taken away by the system: mid-drag, or before it ever moved.
  assert.equal(releasedStep({ ...on, end: 'cancelled', fingerUp: false }), null);
  assert.equal(releasedStep({ ...on, end: 'cancelled', fingerUp: true }), null);
  assert.equal(releasedStep({ ...on, end: 'failed', fingerUp: false }), null);
  // Nothing was under the thumb.
  assert.equal(releasedStep({ ...on, active: null, end: 'ended', fingerUp: true }), null);
});

test('releasedStep calls the drag off when it lifts far from the bar', () => {
  const up = { active: 2, end: 'ended' as const, fingerUp: true, height: 44, slop: 40 };
  assert.equal(releasedStep({ ...up, y: -40 }), 2); // at the edge of the slop
  assert.equal(releasedStep({ ...up, y: 84 }), 2);
  assert.equal(releasedStep({ ...up, y: -41 }), null);
  assert.equal(releasedStep({ ...up, y: 85 }), null);
});

test('selectedStep finds the cell showing a stored rating', () => {
  assert.equal(selectedStep(8, 'rpe'), 4);
  assert.equal(selectedStep(8.5, 'rpe'), 5);
  assert.equal(selectedStep(null, 'rpe'), -1);
  assert.equal(selectedStep(5, 'rpe'), -1); // rated "5+" in RIR; RPE starts at 6
  assert.equal(selectedStep(8, 'rir'), 3); // 2 reps left
  assert.equal(selectedStep(10, 'rir'), 5);
  assert.equal(selectedStep(5, 'rir'), 0);
  assert.equal(selectedStep(3, 'rir'), 0); // anything easier is still "5+"
  assert.equal(selectedStep(8.5, 'rir'), -1); // RIR has no half cells
});

// --- conversion and labels --------------------------------------------

test('effortLabel writes RPE as @n', () => {
  assert.equal(effortLabel(8, 'rpe'), '@8');
  assert.equal(effortLabel(8.5, 'rpe'), '@8.5');
  assert.equal(effortLabel(10, 'rpe'), '@10');
});

test('effortLabel writes RIR as 10 − RPE', () => {
  assert.equal(effortLabel(8, 'rir'), '2 RIR');
  assert.equal(effortLabel(10, 'rir'), '0 RIR');
  assert.equal(effortLabel(9, 'rir'), '1 RIR');
  assert.equal(effortLabel(8.5, 'rir'), '1.5 RIR');
  assert.equal(effortLabel(5, 'rir'), '5+ RIR');
  assert.equal(effortLabel(3, 'rir'), '5+ RIR');
});

test('a rating survives switching scale and back', () => {
  // "5+" picked in RIR is stored as 5 and reads as @5 in RPE.
  const picked = effortSteps('rir')[0].rpe;
  assert.equal(effortLabel(picked, 'rpe'), '@5');
  assert.equal(effortLabel(picked, 'rir'), '5+ RIR');
  // "@9" picked in RPE reads as 1 RIR, and the same cell lights up.
  assert.equal(effortLabel(9, 'rir'), '1 RIR');
  assert.equal(effortSteps('rir')[selectedStep(9, 'rir')].label, '1');
});

test('effortValue is the bare number for a labelled column', () => {
  assert.equal(effortValue(9, 'rpe'), '9');
  assert.equal(effortValue(8.5, 'rpe'), '8.5');
  assert.equal(effortValue(9, 'rir'), '1');
  assert.equal(effortValue(5, 'rir'), '5+');
});

test('row labels follow the chosen scale', () => {
  assert.equal(effortAddLabel('rpe'), '+ RPE');
  assert.equal(effortAddLabel('rir'), '+ RIR');
  assert.equal(effortLastLabel(9, 'rpe'), 'last @9');
  assert.equal(effortLastLabel(9, 'rir'), 'last 1 RIR');
  assert.equal(effortSavedLabel(8, 'rpe'), '@8 saved');
  assert.equal(effortSavedLabel(8, 'rir'), '2 RIR saved');
});

test('the prompt asks in the words of the scale', () => {
  assert.equal(effortAsk('3', 'rpe'), 'SET 3 · HOW HARD?');
  assert.equal(effortAsk('3', 'rir'), 'SET 3 · REPS LEFT?');
  assert.equal(effortAsk('W', 'rpe'), 'SET W · HOW HARD?');
  assert.equal(effortHint('rpe'), '8 = 2 REPS LEFT');
  assert.equal(effortHint('rir'), '0 = NOTHING LEFT');
});

test('effortMeaning says what the value under the thumb means', () => {
  assert.equal(effortMeaning(9, 'rpe'), '@9 · 1 REP LEFT');
  assert.equal(effortMeaning(8, 'rpe'), '@8 · 2 REPS LEFT');
  assert.equal(effortMeaning(10, 'rpe'), '@10 · NOTHING LEFT');
  assert.equal(effortMeaning(8.5, 'rpe'), '@8.5 · 1–2 REPS LEFT');
  assert.equal(effortMeaning(9.5, 'rpe'), '@9.5 · 0–1 REPS LEFT');
  assert.equal(effortMeaning(9, 'rir'), '1 REP LEFT');
  assert.equal(effortMeaning(10, 'rir'), 'NOTHING LEFT');
  assert.equal(effortMeaning(5, 'rir'), '5+ REPS LEFT');
});

test('effortSentence spells the rating out for the sheet', () => {
  assert.equal(effortSentence(8, 'rpe'), '@8 · about two reps left in the tank.');
  assert.equal(effortSentence(9, 'rpe'), '@9 · about one rep left in the tank.');
  assert.equal(effortSentence(10, 'rpe'), '@10 · nothing left in the tank.');
  assert.equal(effortSentence(8.5, 'rpe'), '@8.5 · about one to two reps left in the tank.');
  assert.equal(effortSentence(9.5, 'rpe'), '@9.5 · maybe one rep left in the tank.');
  assert.equal(effortSentence(8, 'rir'), '2 RIR · about two reps left in the tank.');
  assert.equal(effortSentence(5, 'rir'), '5+ RIR · five or more reps left in the tank.');
});

// --- the row's second line --------------------------------------------

const line = (over: Partial<Parameters<typeof effortRowLine>[0]> = {}) =>
  effortRowLine({ mode: 'rpe', done: false, rpe: null, prevRpe: null, hasSuggestion: false, ...over });

test('with the feature off the row gets no effort line at all', () => {
  assert.equal(line({ mode: 'off' }), null);
  assert.equal(line({ mode: 'off', done: true, rpe: 8 }), null);
  assert.equal(line({ mode: 'off', prevRpe: 9 }), null);
});

test('before the set: last session’s rating, when there was one', () => {
  assert.deepEqual(line({ prevRpe: 9 }), { kind: 'last', text: 'last @9' });
  assert.deepEqual(line({ mode: 'rir', prevRpe: 9 }), { kind: 'last', text: 'last 1 RIR' });
  assert.equal(line(), null);
});

test('before the set: a suggestion takes the line', () => {
  assert.equal(line({ prevRpe: 9, hasSuggestion: true }), null);
});

test('after the tick: today’s rating, or the way in to add one', () => {
  assert.deepEqual(line({ done: true, rpe: 8.5 }), { kind: 'today', text: '@8.5' });
  assert.deepEqual(line({ done: true }), { kind: 'add', text: '+ RPE' });
  assert.deepEqual(line({ mode: 'rir', done: true }), { kind: 'add', text: '+ RIR' });
  // A suggestion is gone once the set is logged, so it cannot hide the rating.
  assert.deepEqual(line({ done: true, rpe: 8, hasSuggestion: true }), { kind: 'today', text: '@8' });
  // Last session's rating is not today's.
  assert.deepEqual(line({ done: true, prevRpe: 9 }), { kind: 'add', text: '+ RPE' });
});

test('a rating given before the tick (from the keypad) shows while it waits', () => {
  assert.deepEqual(line({ rpe: 8, prevRpe: 9 }), { kind: 'today', text: '@8' });
  assert.equal(line({ rpe: 8, hasSuggestion: true }), null);
});

// --- when the rest bar asks -------------------------------------------

test('the rest bar asks only when a rest actually starts', () => {
  assert.equal(shouldPromptEffort('rpe', { startRest: true, seconds: 120 }), true);
  assert.equal(shouldPromptEffort('rir', { startRest: true, seconds: 30 }), true);
});

test('no prompt with the feature off, the timer off, or mid-superset', () => {
  assert.equal(shouldPromptEffort('off', { startRest: true, seconds: 120 }), false);
  assert.equal(shouldPromptEffort('rpe', { startRest: true, seconds: 0 }), false);
  assert.equal(shouldPromptEffort('rpe', { startRest: false, seconds: 0 }), false);
});
