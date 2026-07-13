/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { carryFor, completionPatch, resolveSet } from './setCarry.ts';

const s = (weight: string, reps: string) => ({ weight, reps });

test('the first set carries nothing', () => {
  assert.deepEqual(carryFor([s('', '')], 0), { weight: undefined, reps: undefined });
});

test('a later set carries the values of the set above it', () => {
  const sets = [s('60', '8'), s('', '')];
  assert.deepEqual(carryFor(sets, 1), { weight: '60', reps: '8' });
});

test('carries from the nearest filled set, skipping empty ones', () => {
  const sets = [s('60', '8'), s('', ''), s('', '')];
  assert.deepEqual(carryFor(sets, 2), { weight: '60', reps: '8' });
});

test('an edited middle set becomes the source for the ones below it', () => {
  const sets = [s('60', '8'), s('70', '6'), s('', '')];
  assert.deepEqual(carryFor(sets, 2), { weight: '70', reps: '6' });
});

test('weight and reps carry independently', () => {
  // Bodyweight-ish: reps entered, weight left blank all the way up.
  const sets = [s('', '11'), s('', '')];
  assert.deepEqual(carryFor(sets, 1), { weight: undefined, reps: '11' });
});

test('a set never carries from below itself', () => {
  const sets = [s('', ''), s('60', '8')];
  assert.deepEqual(carryFor(sets, 0), { weight: undefined, reps: undefined });
});

test('resolveSet keeps values the user actually typed', () => {
  assert.deepEqual(resolveSet({ weight: '80', reps: '3' }, { weight: '60', reps: '8' }), {
    weight: '80',
    reps: '3',
  });
});

test('resolveSet substitutes the carry for blank fields', () => {
  assert.deepEqual(resolveSet({ weight: '', reps: '' }, { weight: '60', reps: '8' }), {
    weight: '60',
    reps: '8',
  });
});

test('resolveSet fills only the blank field', () => {
  assert.deepEqual(resolveSet({ weight: '', reps: '5' }, { weight: '60', reps: '8' }), {
    weight: '60',
    reps: '5',
  });
});

test('resolveSet leaves a field blank when there is nothing to carry', () => {
  assert.deepEqual(resolveSet({ weight: '', reps: '' }, { weight: undefined, reps: undefined }), {
    weight: '',
    reps: '',
  });
});

test('whitespace is not a value', () => {
  const sets = [s('  ', ' '), s('', '')];
  assert.deepEqual(carryFor(sets, 1), { weight: undefined, reps: undefined });
});

// completionPatch — the single rule behind both the in-app ✓ and the Live
// Activity's ✓. A set must log the same numbers whichever process completes it.

test('completing a typed set patches nothing — the values are already right', () => {
  const sets = [{ weight: '100', reps: '5' }];
  const { filled, patch } = completionPatch(sets, 0);
  assert.deepEqual(filled, { weight: '100', reps: '5' });
  assert.deepEqual(patch, {});
});

test('completing an untouched set patches the carried numbers', () => {
  const sets = [
    { weight: '154', reps: '12' },
    { weight: '', reps: '' },
  ];
  const { filled, patch } = completionPatch(sets, 1);
  assert.deepEqual(filled, { weight: '154', reps: '12' });
  assert.deepEqual(patch, { weight: 154, reps: 12 });
});

test('only the carried column is patched', () => {
  const sets = [
    { weight: '154', reps: '12' },
    { weight: '', reps: '8' },
  ];
  const { patch } = completionPatch(sets, 1);
  assert.deepEqual(patch, { weight: 154 });
});

test('a bodyweight set with nothing to carry patches nothing at all', () => {
  // '' resolves to '', which already matches the row: there is no change to
  // write. Emitting weight: null here would be a pointless PATCH.
  const sets = [{ weight: '', reps: '8' }];
  const { filled, patch } = completionPatch(sets, 0);
  assert.deepEqual(filled, { weight: '', reps: '8' });
  assert.deepEqual(patch, {});
});

test('a blank column carried from a blank column above stays unpatched', () => {
  const sets = [
    { weight: '', reps: '8' },
    { weight: '', reps: '' },
  ];
  const { patch } = completionPatch(sets, 1);
  assert.deepEqual(patch, { reps: 8 });
});

test('carry walks past a blank row to the nearest filled one', () => {
  const sets = [
    { weight: '100', reps: '5' },
    { weight: '', reps: '' },
    { weight: '', reps: '' },
  ];
  assert.deepEqual(completionPatch(sets, 2).patch, { weight: 100, reps: 5 });
});

test('a decimal weight survives the string→number conversion', () => {
  const sets = [
    { weight: '62.5', reps: '10' },
    { weight: '', reps: '' },
  ];
  assert.equal(completionPatch(sets, 1).patch.weight, 62.5);
});
