/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toDisplay, toKg } from './units.ts';

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
