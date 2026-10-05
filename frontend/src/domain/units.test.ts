/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  WEIGHT_STEPS,
  convertWeightText,
  formatVolume,
  formatWeight,
  inputToKg,
  parseWeight,
  toDisplay,
  toKg,
  unitLabel,
  volumeText,
  volumeToDisplay,
  weightText,
} from './units.ts';

test('toDisplay passes kg through, rounded to 2', () => {
  assert.equal(toDisplay(100, 'kg'), 100);
  assert.equal(toDisplay(72.345, 'kg'), 72.35);
});

test('toDisplay converts kg to lb, rounded to 2', () => {
  assert.equal(toDisplay(100, 'lb'), 220.46);
  assert.equal(toDisplay(0, 'lb'), 0);
});

test('toKg passes kg through as a float', () => {
  assert.equal(toKg(100, 'kg'), 100);
  assert.equal(toKg(72.345, 'kg'), 72.345);
});

test('toKg converts lb to kg, rounded to 4', () => {
  assert.equal(toKg(100, 'lb'), 45.3592);
  assert.equal(toKg(0, 'lb'), 0);
});

test('null passes through in both directions and units', () => {
  assert.equal(toDisplay(null, 'kg'), null);
  assert.equal(toDisplay(null, 'lb'), null);
  assert.equal(toKg(null, 'kg'), null);
  assert.equal(toKg(null, 'lb'), null);
});

test('round trips kg -> lb -> kg within rounding tolerance', () => {
  const lb = toDisplay(100, 'lb')!;
  const back = toKg(lb, 'lb')!;
  assert.ok(Math.abs(back - 100) < 0.01, `got ${back}`);
});

// --- Lifting weights: entry, display and volume in the user's unit (#80) ---

test('common plate-math values in lb survive storage and come back exact', () => {
  // Every multiple of 2.5 lb up to 1000: typed, stored as kg, read back.
  for (let lb = 0; lb <= 1000; lb += 2.5) {
    const stored = toKg(lb, 'lb')!;
    assert.equal(toDisplay(stored, 'lb'), lb, `${lb} lb stored as ${stored} kg`);
    assert.equal(weightText(stored, 'lb'), String(lb));
  }
});

test('225 lb is stored as 102.0583 kg and reads back as exactly 225', () => {
  assert.equal(toKg(225, 'lb'), 102.0583);
  assert.equal(toDisplay(102.0583, 'lb'), 225);
  assert.equal(weightText(102.0583, 'lb'), '225');
  assert.equal(formatWeight(102.0583, 'lb'), '225 lb');
});

test('any lb value typed to two decimals round-trips', () => {
  for (const lb of [0.25, 1.25, 12.5, 33.33, 44.09, 99.99, 137.75, 402.5, 999.99]) {
    assert.equal(toDisplay(toKg(lb, 'lb'), 'lb'), lb);
  }
});

test('kg values typed to two decimals round-trip untouched', () => {
  for (const kg of [0, 1.25, 20, 42.5, 60, 102.5, 142.75, 300]) {
    assert.equal(toKg(kg, 'kg'), kg);
    assert.equal(weightText(toKg(kg, 'kg'), 'kg'), String(kg));
  }
});

test('weightText renders a stored weight for an input, blank when unlogged', () => {
  assert.equal(weightText(100, 'kg'), '100');
  assert.equal(weightText(42.5, 'kg'), '42.5');
  assert.equal(weightText(100, 'lb'), '220.46');
  assert.equal(weightText(null, 'lb'), '');
  assert.equal(weightText(undefined, 'kg'), '');
});

test('formatWeight appends the unit', () => {
  assert.equal(formatWeight(60, 'kg'), '60 kg');
  assert.equal(formatWeight(60, 'lb'), '132.28 lb');
});

test('parseWeight reads typed text, comma decimals included', () => {
  assert.equal(parseWeight('24.8'), 24.8);
  assert.equal(parseWeight('24,8'), 24.8);
  assert.equal(parseWeight(' 100 '), 100);
  assert.equal(parseWeight('84.'), 84);
  assert.equal(parseWeight(''), null);
  assert.equal(parseWeight('   '), null);
  assert.equal(parseWeight('abc'), null);
  assert.equal(parseWeight(null), null);
  assert.equal(parseWeight(undefined), null);
});

test('inputToKg converts what was typed in the user unit to kilograms', () => {
  assert.equal(inputToKg('100', 'kg'), 100);
  assert.equal(inputToKg('24,8', 'kg'), 24.8);
  assert.equal(inputToKg('225', 'lb'), 102.0583);
  assert.equal(inputToKg('', 'lb'), null);
  assert.equal(inputToKg('x', 'kg'), null);
});

test('convertWeightText re-expresses typed text when the unit changes', () => {
  assert.equal(convertWeightText('100', 'kg', 'lb'), '220.46');
  assert.equal(convertWeightText('225', 'lb', 'kg'), '102.06');
  assert.equal(convertWeightText('24,8', 'kg', 'lb'), '54.67');
});

test('convertWeightText leaves blanks, junk and same-unit text alone', () => {
  assert.equal(convertWeightText('', 'kg', 'lb'), '');
  assert.equal(convertWeightText('abc', 'kg', 'lb'), 'abc');
  assert.equal(convertWeightText('24,8', 'kg', 'kg'), '24,8');
  assert.equal(convertWeightText('84.', 'lb', 'lb'), '84.');
});

test('kg text survives a switch to lb and back', () => {
  for (const kg of ['20', '42.5', '60', '100', '142.5', '250']) {
    assert.equal(convertWeightText(convertWeightText(kg, 'kg', 'lb'), 'lb', 'kg'), kg);
  }
});

test('lb text through kg text is only good to a hundredth', () => {
  // Two decimals of kg are coarser than two of lb, so re-expressing the *text*
  // can land 0.01 lb out (135 -> "61.23" -> "135.01"). That is why a stored
  // workout is re-read from its kilograms on a unit switch instead of having
  // its text converted; this bounds the error for the cases that cannot be.
  for (const lb of ['45', '135', '225', '227.5', '315', '405']) {
    const back = Number(convertWeightText(convertWeightText(lb, 'lb', 'kg'), 'kg', 'lb'));
    assert.ok(Math.abs(back - Number(lb)) <= 0.0101, `${lb} came back as ${back}`);
  }
});

test('volumeToDisplay converts kilograms of volume, unrounded', () => {
  assert.equal(volumeToDisplay(9177, 'kg'), 9177);
  assert.ok(Math.abs(volumeToDisplay(1000, 'lb') - 2204.6226) < 0.001);
  assert.equal(volumeToDisplay(0, 'lb'), 0);
});

test('a lb session volume reads as the lb arithmetic the user expects', () => {
  // 5 x 5 at 225 lb, each set stored as kg, summed in kg, shown in lb.
  const kg = 5 * 5 * toKg(225, 'lb')!;
  assert.equal(Math.round(volumeToDisplay(kg, 'lb')), 5 * 5 * 225);
});

test('formatVolume groups thousands and names the unit', () => {
  assert.equal(formatVolume(9177, 'kg'), '9,177 kg');
  assert.equal(formatVolume(218.4, 'kg'), '218 kg');
  assert.equal(formatVolume(1000, 'lb'), '2,205 lb');
  assert.equal(formatVolume(0, 'lb'), '0 lb');
  assert.equal(volumeText(9177, 'kg'), '9,177');
  assert.equal(volumeText(1000, 'lb'), '2,205');
});

test('unitLabel upper-cases for column headers', () => {
  assert.equal(unitLabel('kg'), 'KG');
  assert.equal(unitLabel('lb'), 'LB');
});

test('steps are whole plates in the unit, not a converted kg step', () => {
  assert.deepEqual(WEIGHT_STEPS.kg, { bar: 2.5, dumbbell: 2 });
  assert.deepEqual(WEIGHT_STEPS.lb, { bar: 5, dumbbell: 5 });
});
