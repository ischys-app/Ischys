/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { percentageRounder, warmupRounder } from './loadRounding.ts';
import { percentageTable } from './oneRepMax.ts';
import { DEFAULT_BAR_SETUP, DEFAULT_LB_BAR_SETUP } from './plateMath.ts';
import { toDisplay, toKg } from './units.ts';
import { warmupRamp } from './warmupRamp.ts';

const kgGym = DEFAULT_BAR_SETUP;
const lbGym = DEFAULT_LB_BAR_SETUP;

/** Kilograms as stored for a number of pounds, and back. */
const lb = (n: number) => toKg(n, 'lb')!;
const inLb = (kg: number) => toDisplay(kg, 'lb');

// --- kilograms: exactly what the sheets did before ---

test('kg barbell warm-ups round down to a loadable weight', () => {
  const round = warmupRounder('barbell', kgGym, 'kg');
  assert.equal(round(101), 100);
  assert.equal(round(102.5), 102.5);
  assert.equal(round(12), 20, 'never under the bar');
});

test('kg dumbbells snap to 2 and machines to 5, never to nothing', () => {
  assert.equal(warmupRounder('dumbbell', kgGym, 'kg')(17.2), 18);
  assert.equal(warmupRounder('machine', kgGym, 'kg')(17.2), 15);
  assert.equal(warmupRounder('dumbbell', kgGym, 'kg')(0.4), 2);
  assert.equal(warmupRounder('machine', kgGym, 'kg')(1), 5);
});

test('kg percentages round to 2.5 off the bar and to plates on it', () => {
  assert.equal(percentageRounder(false, kgGym, 'kg')(101), 100);
  assert.equal(percentageRounder(false, kgGym, 'kg')(101.3), 102.5);
  assert.equal(percentageRounder(true, kgGym, 'kg')(101.3), 100);
});

// --- pounds: whole pound plates, handed back as kilograms ---

test('lb barbell warm-ups round down to pound plates', () => {
  const round = warmupRounder('barbell', lbGym, 'lb');
  assert.equal(inLb(round(lb(137))), 135);
  assert.equal(inLb(round(lb(225))), 225);
  assert.equal(inLb(round(lb(30))), 45, 'never under the bar');
});

test('lb dumbbells snap to 5 and machines to 10', () => {
  assert.equal(inLb(warmupRounder('dumbbell', lbGym, 'lb')(lb(37))), 35);
  assert.equal(inLb(warmupRounder('cable', lbGym, 'lb')(lb(38))), 40);
  assert.equal(inLb(warmupRounder('machine', lbGym, 'lb')(lb(37))), 40);
  assert.equal(inLb(warmupRounder('dumbbell', lbGym, 'lb')(lb(1))), 5);
});

test('lb percentages round to 5 off the bar, where kg rounds to 2.5', () => {
  const round = percentageRounder(false, lbGym, 'lb');
  assert.equal(inLb(round(lb(213.75))), 215);
  assert.equal(inLb(round(lb(202.4))), 200);
});

test('a rounded pound load is the kg that reads as exactly that number', () => {
  assert.equal(warmupRounder('barbell', lbGym, 'lb')(lb(226)), 102.0583);
  assert.equal(percentageRounder(false, lbGym, 'lb')(lb(224)), 102.0583);
});

// --- through the real ladder and the real table ---

test('a 225 lb barbell ramp is the bar, then loadable pound weights', () => {
  const rows = warmupRamp({
    workingKg: lb(225),
    barKg: lb(45),
    sets: 5,
    round: warmupRounder('barbell', lbGym, 'lb'),
  });
  assert.deepEqual(
    rows.map((r) => inLb(r.kg)),
    [45, 90, 135, 180, 200],
  );
});

test('a 100 kg barbell ramp is unchanged', () => {
  const rows = warmupRamp({
    workingKg: 100,
    barKg: 20,
    sets: 5,
    round: warmupRounder('barbell', kgGym, 'kg'),
  });
  assert.deepEqual(
    rows.map((r) => r.kg),
    [20, 40, 60, 80, 90],
  );
});

test('a 1RM table in pounds moves in 5s', () => {
  const rows = percentageTable(lb(315), { round: percentageRounder(false, lbGym, 'lb') });
  assert.deepEqual(
    rows.slice(0, 4).map((r) => inLb(r.kg)),
    [315, 300, 285, 270],
  );
  assert.ok(rows.every((r) => (inLb(r.kg) ?? 0) % 5 === 0));
});
