/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWeeklyBars, WEEK_BARS } from './weeklyBars.ts';

const w = (started_at: string) => ({ started_at });

test('always renders WEEK_BARS columns', () => {
  const { counts } = buildWeeklyBars([], new Date(2026, 6, 11));
  assert.equal(counts.length, WEEK_BARS);
});

test('this-week workouts land in the final bar — DST must not shift them early', () => {
  // Jul 11 2026 is a Saturday; its ISO week is Mon Jul 6. A spring-forward DST
  // transition sits between January and July, so a floored ms/week division
  // would drop these one bucket short and leave the current week at 0.
  const now = new Date(2026, 6, 11);
  const { counts } = buildWeeklyBars(
    [w('2026-07-07T20:00:00'), w('2026-07-08T18:30:00'), w('2026-07-11T09:00:00')],
    now,
  );
  assert.equal(counts[counts.length - 1], 3, 'current week should hold all three');
  assert.equal(counts[counts.length - 2], 0, 'previous week should be empty');
});

test('buckets by ISO week across a DST boundary', () => {
  const now = new Date(2026, 6, 11); // Sat Jul 11
  // One workout the week before (Mon Jun 29 – Sun Jul 5) and one this week.
  const { counts } = buildWeeklyBars([w('2026-07-01T10:00:00'), w('2026-07-09T10:00:00')], now);
  assert.equal(counts[counts.length - 1], 1);
  assert.equal(counts[counts.length - 2], 1);
});

test('ignores workouts from other years', () => {
  const { counts, max } = buildWeeklyBars(
    [w('2025-07-08T18:30:00'), w('2026-07-08T18:30:00')],
    new Date(2026, 6, 11),
  );
  assert.equal(max, 1);
  assert.equal(counts[counts.length - 1], 1);
});

test('month axis marks each month change and anchors to the current month last', () => {
  const { ticks, counts } = buildWeeklyBars([], new Date(2026, 6, 11));
  // 26 weeks back from Jul spans ~Jan→Jul: labels are ascending, unique months.
  const labels = ticks.map((t) => t.label);
  assert.ok(labels.length >= 5 && labels.length <= 7, `got ${labels.join(',')}`);
  assert.equal(new Set(labels).size, labels.length, 'no duplicate months');
  // The last tick is July and sits within the visible range.
  const last = ticks[ticks.length - 1];
  assert.equal(last.label, 'Jul');
  assert.ok(last.index >= 0 && last.index < counts.length);
});

test('avg counts only weeks that have workouts', () => {
  const { avg } = buildWeeklyBars(
    [w('2026-07-08T10:00:00'), w('2026-07-09T10:00:00')],
    new Date(2026, 6, 11),
  );
  assert.equal(avg, 2); // one active week with two workouts
});
