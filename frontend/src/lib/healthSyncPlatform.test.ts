/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { healthCopy, readRowKind, readsAllowed } from './healthSyncPlatform.ts';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const receipt = (daysAgo: number) => ({
  at: new Date(NOW - daysAgo * DAY).toISOString(),
  value: '132 bpm',
});

test('Android never names the iOS product, and iOS never names Health Connect', () => {
  const android = JSON.stringify(healthCopy('android'));
  assert.doesNotMatch(android, /Apple|iOS|iPhone|HealthKit|Fitness/);
  const ios = JSON.stringify(healthCopy('ios'));
  assert.doesNotMatch(ios, /Health Connect|Android/);
});

test('each platform is called by its own name', () => {
  assert.equal(healthCopy('android').name, 'Health Connect');
  assert.equal(healthCopy('ios').name, 'Apple Health');
  // Web and anything unknown read as iOS, which is what they read as before.
  assert.equal(healthCopy('web').name, 'Apple Health');
});

test('Android offers body fat alone: Health Connect has no waist', () => {
  assert.equal(healthCopy('android').reads.readBody.label, 'Body fat');
  assert.equal(healthCopy('ios').reads.readBody.label, 'Waist and body fat');
});

test('a switch that is off is off, whatever is allowed or arrived', () => {
  assert.equal(readRowKind(receipt(1), false, true, NOW), 'off');
  assert.equal(readRowKind(null, false, false, NOW), 'off');
});

test('with the grant unknown (iOS), only the receipt speaks', () => {
  assert.equal(readRowKind(null, true, null, NOW), 'nothing');
  assert.equal(readRowKind(receipt(1), true, null, NOW), 'receiving');
  assert.equal(readRowKind(receipt(31), true, null, NOW), 'nothing');
  assert.equal(readRowKind({ at: 'not a date', value: '' }, true, null, NOW), 'nothing');
});

test('a known refusal outranks a receipt from before it', () => {
  assert.equal(readRowKind(receipt(1), true, false, NOW), 'denied');
  assert.equal(readRowKind(null, true, false, NOW), 'denied');
});

test('an allowed read still has to receive something', () => {
  assert.equal(readRowKind(null, true, true, NOW), 'nothing');
  assert.equal(readRowKind(receipt(2), true, true, NOW), 'receiving');
});

test('rows map onto the permissions behind them', () => {
  assert.deepEqual(readsAllowed(null), { readHR: null, readEnergy: null, readBody: null });
  assert.deepEqual(
    readsAllowed({ writeWorkouts: true, readHeartRate: true, readEnergy: false, readBodyFat: true }),
    { readHR: true, readEnergy: false, readBody: true },
  );
});
