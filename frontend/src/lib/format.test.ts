/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fmtHeaderDate,
  fmtHistoryGroupTitle,
  fmtShortDayUpper,
  fmtVolumeLarge,
  fmtVolumeShort,
  parseIso,
} from './format.ts';

// These assertions hold in ANY timezone: they compare a naive timestamp against
// its explicit-UTC twin, rather than against a hardcoded local rendering.

test('a naive timestamp parses to the same instant as its explicit-Z twin', () => {
  assert.equal(
    parseIso('2026-07-11T05:00:00').getTime(),
    parseIso('2026-07-11T05:00:00Z').getTime(),
  );
});

test('a naive timestamp is NOT read as local time', () => {
  // The bug: `new Date('2026-07-11T05:00:00')` means 05:00 local. Only in UTC
  // is that the same instant as 05:00Z, so skip the assertion there.
  const offset = new Date(Date.UTC(2026, 6, 11)).getTimezoneOffset();
  if (offset === 0) return;
  assert.notEqual(
    parseIso('2026-07-11T05:00:00').getTime(),
    new Date('2026-07-11T05:00:00').getTime(),
  );
});

test('an explicit offset is honoured, not clobbered', () => {
  // 08:00+03:00 is the same instant as 05:00Z.
  assert.equal(
    parseIso('2026-07-11T08:00:00+03:00').getTime(),
    parseIso('2026-07-11T05:00:00Z').getTime(),
  );
});

test('a date-only string still means local midnight, not UTC midnight', () => {
  // Day grouping is about the user's calendar, so this must stay local.
  const d = parseIso('2026-07-11');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 11);
  assert.equal(d.getHours(), 0);
});

test('the header date renders the same for a naive timestamp and its Z twin', () => {
  assert.equal(fmtHeaderDate('2026-07-08T12:00:00'), fmtHeaderDate('2026-07-08T12:00:00Z'));
});

test('history groups a midday workout by the same week either way', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  assert.equal(
    fmtHistoryGroupTitle('2026-07-09T12:00:00', now),
    fmtHistoryGroupTitle('2026-07-09T12:00:00Z', now),
  );
});

// --- volume in the user's unit (storage is kg) ---

test('fmtVolumeShort keeps kg as it was and names the unit', () => {
  assert.deepEqual(fmtVolumeShort(850, 'kg'), { value: '850', unit: ' kg' });
  assert.deepEqual(fmtVolumeShort(9177, 'kg'), { value: '9.2', unit: 'k kg' });
});

test('fmtVolumeShort converts before it picks the k threshold', () => {
  // 500 kg is 1,102 lb: under the threshold in kg, over it in lb.
  assert.deepEqual(fmtVolumeShort(500, 'lb'), { value: '1.1', unit: 'k lb' });
  assert.deepEqual(fmtVolumeShort(100, 'lb'), { value: '220', unit: ' lb' });
});

test('fmtVolumeLarge scales through k and M in either unit', () => {
  assert.deepEqual(fmtVolumeLarge(218, 'kg'), { value: '218', unit: ' kg' });
  assert.deepEqual(fmtVolumeLarge(12_500, 'kg'), { value: '12.5', unit: 'k kg' });
  assert.deepEqual(fmtVolumeLarge(1_840_000, 'kg'), { value: '1.84', unit: 'M kg' });
  assert.deepEqual(fmtVolumeLarge(12_500, 'lb'), { value: '27.6', unit: 'k lb' });
  assert.deepEqual(fmtVolumeLarge(500_000, 'lb'), { value: '1.10', unit: 'M lb' });
});

test('garbage does not throw', () => {
  assert.ok(Number.isNaN(parseIso('nonsense').getTime()));
});

test('the short day reads weekday, day, month in capitals', () => {
  // Built from local parts, so it holds in any timezone.
  assert.equal(fmtShortDayUpper(new Date(2025, 8, 30, 18, 4)), 'TUE 30 SEP');
  assert.equal(fmtShortDayUpper(new Date(2026, 0, 4)), 'SUN 4 JAN');
});
