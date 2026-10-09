/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toDisplay, toKg } from '../domain/units.ts';
import { bodyweightInRange, bodyweightToStore } from './bodyweightValue.ts';

test('a bodyweight typed in pounds reads back as typed', () => {
  // Stored to a tenth of a kilogram, 180 lb read back as 179.9, 225 as 225.09
  // and 150 as 149.91.
  for (const lb of [99, 150, 165.5, 180, 200, 225, 242.25, 300]) {
    const stored = bodyweightToStore(toKg(lb, 'lb') as number);
    assert.equal(toDisplay(stored, 'lb'), lb, `${lb} lb`);
  }
});

test('a bodyweight typed in kilograms is kept as typed', () => {
  for (const kg of [60, 72.5, 81.6, 100.25]) {
    assert.equal(bodyweightToStore(kg), kg);
    assert.equal(toDisplay(bodyweightToStore(kg), 'kg'), kg);
  }
});

test('float noise is trimmed, not stored', () => {
  assert.equal(bodyweightToStore(81.60000000000001), 81.6);
  assert.equal(String(bodyweightToStore(0.1 + 0.2 + 80)), '80.3');
});

test('a weight no person has is not stored', () => {
  assert.equal(bodyweightToStore(19.9), null);
  assert.equal(bodyweightToStore(501), null);
  assert.equal(bodyweightToStore(Number.NaN), null);
  assert.equal(bodyweightInRange(20), true);
  assert.equal(bodyweightInRange(500), true);
});
