/** Run with: npm test — covers the body-measurement domain logic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  METRICS,
  deltaBetween,
  dimensionOf,
  formatMeasurement,
  lengthUnitFor,
  toCanonical,
  toDisplay,
  unitFor,
} from './measurements.ts';

const metric = { weightUnit: 'kg' } as const;
const imperial = { weightUnit: 'lb' } as const;

test('every tracked metric has exactly one dimension', () => {
  assert.equal(METRICS.length, 10);
  const dims = METRICS.map(dimensionOf);
  assert.ok(dims.includes('length'));
  assert.ok(dims.includes('mass'));
  assert.ok(dims.includes('percent'));
});

test('girth metrics are lengths, bodyweight is a mass, body fat is a percent', () => {
  for (const m of ['waist', 'chest', 'arms', 'thighs', 'calves', 'shoulders', 'hips', 'neck'] as const) {
    assert.equal(dimensionOf(m), 'length', m);
  }
  assert.equal(dimensionOf('bodyweight'), 'mass');
  assert.equal(dimensionOf('bodyFat'), 'percent');
});

test('length display unit follows the weight unit when no override is given', () => {
  assert.equal(lengthUnitFor(metric), 'cm');
  assert.equal(lengthUnitFor(imperial), 'in');
});

test('an explicit length unit override beats the weight unit', () => {
  assert.equal(lengthUnitFor({ weightUnit: 'lb', lengthUnit: 'cm' }), 'cm');
  assert.equal(lengthUnitFor({ weightUnit: 'kg', lengthUnit: 'in' }), 'in');
});

test('unitFor reports the suffix each metric is shown in', () => {
  assert.equal(unitFor('waist', metric), 'cm');
  assert.equal(unitFor('waist', imperial), 'in');
  assert.equal(unitFor('waist', { weightUnit: 'lb', lengthUnit: 'cm' }), 'cm');
  assert.equal(unitFor('bodyweight', metric), 'kg');
  assert.equal(unitFor('bodyweight', imperial), 'lb');
  assert.equal(unitFor('bodyFat', imperial), '%');
});

test('toDisplay passes centimetres through and converts them to inches', () => {
  assert.deepEqual(toDisplay(84, 'waist', metric), { value: 84, unit: 'cm' });
  assert.deepEqual(toDisplay(84, 'waist', imperial), { value: 33.07, unit: 'in' });
});

test('toDisplay converts a canonical kilogram mass to pounds', () => {
  assert.deepEqual(toDisplay(80, 'bodyweight', metric), { value: 80, unit: 'kg' });
  assert.deepEqual(toDisplay(80, 'bodyweight', imperial), { value: 176.37, unit: 'lb' });
});

test('a percent never converts, whatever the units are', () => {
  assert.deepEqual(toDisplay(18.4, 'bodyFat', metric), { value: 18.4, unit: '%' });
  assert.deepEqual(toDisplay(18.4, 'bodyFat', imperial), { value: 18.4, unit: '%' });
  assert.deepEqual(toDisplay(18.4, 'bodyFat', { weightUnit: 'lb', lengthUnit: 'in' }), { value: 18.4, unit: '%' });
  assert.equal(toCanonical('18.4', 'bodyFat', imperial), 18.4);
});

test('toCanonical converts an entered display value back to cm and kg', () => {
  assert.equal(toCanonical('84', 'waist', metric), 84);
  // Exact, not tidied: 33.07 in is what the field showed, and 83.9978 cm is
  // what it means. Snapping to 84 would invent precision the user never typed.
  assert.equal(toCanonical('33.07', 'waist', imperial), 83.9978);
  assert.equal(toCanonical('176.37', 'bodyweight', imperial), 80.0001);
});

test('toCanonical accepts a comma decimal separator from a comma-locale keypad', () => {
  assert.equal(toCanonical('24,8', 'arms', metric), 24.8);
  assert.equal(toCanonical('24.8', 'arms', metric), 24.8);
  assert.equal(toCanonical('18,45', 'bodyFat', metric), 18.45);
  // parseFloat alone would have truncated this to 24 — the bug this guards.
  assert.notEqual(toCanonical('24,8', 'arms', metric), 24);
});

test('toCanonical tolerates surrounding whitespace and a half-typed decimal point', () => {
  assert.equal(toCanonical('  84  ', 'waist', metric), 84);
  assert.equal(toCanonical('84,', 'waist', metric), 84);
  assert.equal(toCanonical(',5', 'bodyFat', metric), 0.5);
});

test('malformed input returns null rather than NaN', () => {
  for (const bad of ['', '   ', 'abc', '84cm', '8,4,2', '--3', '.', ',', 'NaN', 'Infinity', '1e5']) {
    assert.equal(toCanonical(bad, 'waist', metric), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test('a negative measurement is rejected, since no body measurement is below zero', () => {
  assert.equal(toCanonical('-3', 'waist', metric), null);
  assert.equal(toCanonical('-0.5', 'bodyFat', metric), null);
});

test('cm round-trips through inches without drifting past display precision', () => {
  for (const cm of [60, 72.5, 84, 85, 101.6, 33.3]) {
    const shown = toDisplay(cm, 'waist', imperial).value;
    const back = toCanonical(String(shown), 'waist', imperial)!;
    // Display is 2dp of inches, so half a step (0.005 in) is the inherent floor.
    assert.ok(Math.abs(back - cm) <= 0.005 * 2.54 + 1e-9, `${cm} -> ${shown} -> ${back}`);
  }
});

test('cm round-trips through cm exactly', () => {
  for (const cm of [60, 72.5, 84, 101.6]) {
    assert.equal(toCanonical(String(toDisplay(cm, 'waist', metric).value), 'waist', metric), cm);
  }
});

test('formatMeasurement holds decimal places fixed so digits do not jitter', () => {
  assert.equal(formatMeasurement(84, 'waist', metric), '84.0 cm');
  assert.equal(formatMeasurement(84.25, 'waist', metric), '84.3 cm');
  assert.equal(formatMeasurement(84, 'waist', imperial), '33.1 in');
  assert.equal(formatMeasurement(80, 'bodyweight', metric), '80.0 kg');
  assert.equal(formatMeasurement(80, 'bodyweight', imperial), '176.4 lb');
  assert.equal(formatMeasurement(18, 'bodyFat', metric), '18.0 %');
});

test('a shrinking measurement reads as a signed negative delta', () => {
  assert.equal(deltaBetween(86.5, 84, 'waist', metric), '-2.5 cm');
  assert.equal(deltaBetween(82, 80, 'bodyweight', metric), '-2.0 kg');
});

test('a growing measurement reads as a signed positive delta', () => {
  assert.equal(deltaBetween(36, 38.2, 'chest', metric), '+2.2 cm');
  assert.equal(deltaBetween(18, 18.4, 'bodyFat', metric), '+0.4 %');
});

test('an unchanged measurement reads as a zero delta with no sign', () => {
  assert.equal(deltaBetween(84, 84, 'waist', metric), '0.0 cm');
  assert.equal(deltaBetween(18.4, 18.4, 'bodyFat', metric), '0.0 %');
});

test('a delta is computed in the display unit, not the canonical one', () => {
  // 5.08 cm is exactly 2 inches.
  assert.equal(deltaBetween(84, 89.08, 'waist', imperial), '+2.0 in');
  assert.equal(deltaBetween(84, 89.08, 'waist', metric), '+5.1 cm');
});

test('a delta returns only a signed value, never a judgement', () => {
  // Losing waist and losing muscle produce identically-shaped strings: the
  // module takes no view on which direction is good.
  assert.equal(deltaBetween(86.5, 84, 'waist', metric), '-2.5 cm');
  assert.equal(deltaBetween(40, 37.5, 'arms', metric), '-2.5 cm');
});

test('a delta smaller than the fixed precision rounds to zero rather than jittering', () => {
  assert.equal(deltaBetween(84, 84.02, 'waist', metric), '0.0 cm');
});

test('formatMeasurement / deltaBetween: ru decimal comma, en and zh-Hans unchanged', () => {
  assert.equal(formatMeasurement(84.25, 'waist', metric, 'ru'), '84,3 cm');
  assert.equal(formatMeasurement(84, 'waist', imperial, 'ru'), '33,1 in');
  assert.equal(deltaBetween(84, 82.5, 'waist', metric, 'ru'), '-1,5 cm');
  for (const lang of ['en', 'zh-Hans'] as const) {
    assert.equal(formatMeasurement(84.25, 'waist', metric, lang), '84.3 cm');
    assert.equal(formatMeasurement(84, 'waist', imperial, lang), '33.1 in');
    assert.equal(deltaBetween(84, 82.5, 'waist', metric, lang), '-1.5 cm');
  }
});

test('a ru-formatted measurement number round-trips through toCanonical', () => {
  const shown = formatMeasurement(84.3, 'waist', metric, 'ru').split(' ')[0];
  assert.equal(shown, '84,3');
  assert.equal(toCanonical(shown, 'waist', metric), 84.3);
});
