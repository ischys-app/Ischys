/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseServerDate, secondsSince } from './serverTime.ts';

const UTC_5AM = Date.UTC(2026, 6, 11, 5, 0, 0);

test('a naive timestamp is read as UTC, which is what the server meant', () => {
  // SQLite drops the offset, so this is what the API actually sends.
  assert.equal(parseServerDate('2026-07-11T05:00:00'), UTC_5AM);
});

test('the naive reading does not depend on the device timezone', () => {
  // The bug: Date.parse reads this as 05:00 *local*, which in UTC+3 is 02:00Z —
  // making a workout started a minute ago look three hours old.
  // getTimezoneOffset() is minutes *behind* UTC, so Athens is -180.
  const offsetMs = new Date(UTC_5AM).getTimezoneOffset() * 60_000;
  assert.equal(Date.parse('2026-07-11T05:00:00'), UTC_5AM + offsetMs);

  // The fix is offset-independent: same instant whatever the device thinks.
  assert.equal(parseServerDate('2026-07-11T05:00:00'), UTC_5AM);
});

test('an explicit Z is left alone', () => {
  assert.equal(parseServerDate('2026-07-11T05:00:00Z'), UTC_5AM);
});

test('an explicit +00:00 offset is left alone', () => {
  assert.equal(parseServerDate('2026-07-11T05:00:00+00:00'), UTC_5AM);
});

test('a real offset is honoured, not overwritten with Z', () => {
  // 08:00+03:00 is the same instant as 05:00Z. Appending Z would have broken it.
  assert.equal(parseServerDate('2026-07-11T08:00:00+03:00'), UTC_5AM);
});

test('a compact offset without a colon is honoured', () => {
  assert.equal(parseServerDate('2026-07-11T08:00:00+0300'), UTC_5AM);
});

test('fractional seconds survive', () => {
  assert.equal(parseServerDate('2026-07-11T05:00:00.500'), UTC_5AM + 500);
});

test('garbage is NaN, not a wrong number', () => {
  assert.ok(Number.isNaN(parseServerDate('not a date')));
  assert.ok(Number.isNaN(parseServerDate('')));
});

test('secondsSince counts from a naive server timestamp', () => {
  assert.equal(secondsSince('2026-07-11T05:00:00', UTC_5AM + 90_000), 90);
});

test('secondsSince never goes negative for a future timestamp', () => {
  assert.equal(secondsSince('2026-07-11T05:00:00', UTC_5AM - 60_000), 0);
});

test('secondsSince treats an unparseable timestamp as 0, not NaN', () => {
  assert.equal(secondsSince('nonsense', UTC_5AM), 0);
});
