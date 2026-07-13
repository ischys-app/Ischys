/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dayStreak, weekStreak } from './streak.ts';

const TODAY = new Date(2026, 6, 8); // Wed Jul 8 2026
const d = (day: number) => new Date(2026, 6, day); // a July 2026 date

// --- day streak ---

test('day streak counts consecutive days ending today', () => {
  assert.equal(dayStreak([d(6), d(7), d(8)], TODAY), 3);
});

test('day streak grace: today a rest day but yesterday trained', () => {
  assert.equal(dayStreak([d(5), d(6), d(7)], TODAY), 3);
});

test('day streak broken (last workout 2 days ago) returns 0', () => {
  assert.equal(dayStreak([d(5), d(6)], TODAY), 0);
});

test('day streak ignores duplicate same-day sessions', () => {
  assert.equal(dayStreak([d(7), d(7), d(8), d(8)], TODAY), 2);
});

test('day streak of no workouts is 0', () => {
  assert.equal(dayStreak([], TODAY), 0);
});

test('day streak stops at the first gap', () => {
  // 8,7 consecutive, gap at 6, then 5,4 — only the top run counts.
  assert.equal(dayStreak([d(4), d(5), d(7), d(8)], TODAY), 2);
});

// --- week streak ---

test('week streak counts consecutive ISO weeks ending this week', () => {
  assert.equal(
    weekStreak([new Date(2026, 5, 24), new Date(2026, 6, 1), new Date(2026, 6, 8)], TODAY),
    3,
  );
});

test('week streak grace: this week empty but last week trained', () => {
  assert.equal(weekStreak([new Date(2026, 5, 24), new Date(2026, 6, 1)], TODAY), 2);
});

test('week streak broken (last workout 2 weeks ago) returns 0', () => {
  assert.equal(weekStreak([new Date(2026, 5, 24)], TODAY), 0);
});

test('week streak of no workouts is 0', () => {
  assert.equal(weekStreak([], TODAY), 0);
});

test('week streak stops at a skipped week', () => {
  // Weeks of Jul 8 and Jul 1 are active, the week of Jun 24 is missing.
  const dates = [new Date(2026, 6, 8), new Date(2026, 6, 1), new Date(2026, 5, 17)];
  assert.equal(weekStreak(dates, TODAY), 2);
});

test('week streak survives a spring-forward DST boundary', () => {
  // US DST springs forward on Sun Mar 8 2026. A five-week run straddles it:
  // calendar (not ms) week math must keep every week whole.
  const today = new Date(2026, 2, 18); // Wed Mar 18 2026
  const dates = [
    new Date(2026, 2, 17), // week of Mon Mar 16 (this week)
    new Date(2026, 2, 10), // week of Mon Mar 9  (after DST)
    new Date(2026, 2, 3), //  week of Mon Mar 2  (before DST)
    new Date(2026, 1, 24), // week of Mon Feb 23
    new Date(2026, 1, 17), // week of Mon Feb 16
  ];
  assert.equal(weekStreak(dates, today), 5);
});
