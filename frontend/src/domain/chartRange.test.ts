/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  axisTicks,
  CHART_RANGES,
  gapKind,
  rangeSince,
  selectionWithin,
  trendPerMonth,
} from './chartRange.ts';

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 29, 12);

test('offers 3M, 6M, 1Y and ALL', () => {
  assert.deepEqual(CHART_RANGES.map((r) => r.id), ['3M', '6M', '1Y', 'ALL']);
});

test('a range becomes the timestamp to read from', () => {
  assert.equal(rangeSince('ALL', NOW), null);
  const since = rangeSince('3M', NOW)!;
  const months = (NOW - since) / DAY / 30.4;
  assert.ok(months > 2.8 && months < 3.2, `${months} months`);
});

test('longer ranges reach further back', () => {
  const three = rangeSince('3M', NOW)!;
  const six = rangeSince('6M', NOW)!;
  const year = rangeSince('1Y', NOW)!;
  assert.ok(six < three);
  assert.ok(year < six);
});

// --- gaps ---

test('sessions close together draw an unbroken line', () => {
  assert.equal(gapKind(3 * DAY), 'none');
  assert.equal(gapKind(21 * DAY), 'none');
});

test('a gap over three weeks dashes the line', () => {
  assert.equal(gapKind(22 * DAY), 'dashed');
  assert.equal(gapKind(41 * DAY), 'dashed');
});

test('a gap over six weeks is a band, because a break is a fact about training', () => {
  assert.equal(gapKind(43 * DAY), 'band');
  assert.equal(gapKind(200 * DAY), 'band');
});

// --- trend ---

const series = (...pts: [number, number][]) => pts.map(([day, value]) => ({ t: NOW - day * DAY, value }));

test('a steadily climbing lift trends up per month', () => {
  // +2.5 kg every 30 days.
  const trend = trendPerMonth(series([90, 100], [60, 102.5], [30, 105], [0, 107.5]));
  assert.ok(trend !== null);
  assert.ok(Math.abs(trend! - 2.5) < 0.2, `got ${trend}`);
});

test('a falling lift trends down', () => {
  const trend = trendPerMonth(series([90, 110], [60, 105], [30, 100], [0, 95]));
  assert.ok(trend !== null && trend < 0);
});

test('a flat lift trends at zero', () => {
  const trend = trendPerMonth(series([90, 100], [60, 100], [30, 100], [0, 100]));
  assert.ok(trend !== null && Math.abs(trend!) < 0.01);
});

test('no trend from too few sessions to mean anything', () => {
  assert.equal(trendPerMonth(series([30, 100], [15, 102], [0, 104])), null);
});

test('no trend when the sessions are all crammed into a fortnight', () => {
  assert.equal(trendPerMonth(series([12, 100], [8, 102], [4, 104], [0, 106])), null);
});

test('no trend without any sessions', () => {
  assert.equal(trendPerMonth([]), null);
});

// --- axis ticks ---

test('a short range is ticked by month', () => {
  const t = (m: number, d: number) => Date.UTC(2026, m, d);
  const ticks = axisTicks([t(5, 3), t(6, 14), t(7, 20)], '3M');
  assert.ok(ticks.length >= 2);
  assert.ok(ticks.every((k) => /^[A-Z][a-z]{2}$/.test(k.label)), ticks.map((k) => k.label).join());
});

test('the longest range is ticked by year', () => {
  const ticks = axisTicks([Date.UTC(2024, 1, 1), Date.UTC(2026, 6, 1)], 'ALL');
  assert.deepEqual(ticks.map((k) => k.label), ['2024', '2025', '2026']);
});

test('ticks sit proportionally along the axis', () => {
  const ticks = axisTicks([Date.UTC(2026, 0, 1), Date.UTC(2026, 2, 1)], '3M');
  assert.ok(ticks.every((k) => k.pct >= 0 && k.pct <= 100));
  assert.ok(ticks.every((k, i) => i === 0 || k.pct > ticks[i - 1].pct));
});

test('no ticks without a span to lay them along', () => {
  assert.deepEqual(axisTicks([], '3M'), []);
  assert.deepEqual(axisTicks([Date.UTC(2026, 0, 1)], '3M'), []);
});

test('a selection survives only while its point is still on the chart', () => {
  assert.equal(selectionWithin(3, 10), 3);
  assert.equal(selectionWithin(0, 1), 0);
  // The range got shorter under a tapped point: 40 sessions became 8.
  assert.equal(selectionWithin(39, 8), null);
  assert.equal(selectionWithin(8, 8), null);
  assert.equal(selectionWithin(null, 8), null);
  assert.equal(selectionWithin(-1, 8), null);
  assert.equal(selectionWithin(0, 0), null);
});
