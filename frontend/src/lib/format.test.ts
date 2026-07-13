/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fmtHeaderDate, fmtHistoryGroupTitle, parseIso } from './format.ts';

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

test('garbage does not throw', () => {
  assert.ok(Number.isNaN(parseIso('nonsense').getTime()));
});
