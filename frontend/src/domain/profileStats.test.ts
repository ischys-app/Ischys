/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { profileStats } from './profileStats.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();

test('counts workouts, this-year, sums volume', () => {
  const now = new Date(2026, 6, 12); // Jul 12 2026
  const r = profileStats(
    [
      { startedAt: at(2026, 7, 10), totalVolume: 1000 },
      { startedAt: at(2026, 1, 3), totalVolume: 500 },
      { startedAt: at(2025, 12, 30), totalVolume: 250 }, // prior year
    ],
    now,
  );
  assert.equal(r.workouts, 3);
  assert.equal(r.thisYear, 2);
  assert.equal(r.volumeLifted, 1750);
});

test('current streak counts consecutive ISO weeks up to this week', () => {
  const now = new Date(2026, 6, 12); // Sat Jul 12 2026
  const r = profileStats(
    [
      { startedAt: at(2026, 7, 8), totalVolume: 100 }, // this week
      { startedAt: at(2026, 7, 1), totalVolume: 100 }, // last week
      { startedAt: at(2026, 6, 24), totalVolume: 100 }, // week before
    ],
    now,
  );
  assert.equal(r.currentStreak, 3);
});

test('no workouts -> zeroed stats', () => {
  const r = profileStats([], new Date(2026, 6, 12));
  assert.deepEqual(r, { workouts: 0, thisYear: 0, volumeLifted: 0, currentStreak: 0 });
});
