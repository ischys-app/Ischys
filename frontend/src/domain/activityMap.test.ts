/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activityMap } from './activityMap.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();

test('covers weeks*7 + 1 days ending today', () => {
  const today = new Date(2026, 6, 12);
  const r = activityMap([], 2, today);
  assert.equal(r.weeks, 2);
  assert.equal(r.days.length, 2 * 7 + 1);
  assert.equal(r.days[r.days.length - 1].date, '2026-07-12'); // last day is today
});

test('counts sessions per day, intensity capped at 3', () => {
  const today = new Date(2026, 6, 12);
  const startedAts = [
    at(2026, 7, 10),
    at(2026, 7, 10),
    at(2026, 7, 10),
    at(2026, 7, 10), // 4 on one day -> intensity capped at 3
    at(2026, 7, 11),
  ];
  const r = activityMap(startedAts, 4, today);
  assert.equal(r.sessions, 5);
  const d10 = r.days.find((d) => d.date === '2026-07-10')!;
  const d11 = r.days.find((d) => d.date === '2026-07-11')!;
  assert.equal(d10.intensity, 3);
  assert.equal(d11.intensity, 1);
});

test('sessions before the window are excluded', () => {
  const today = new Date(2026, 6, 12);
  const r = activityMap([at(2026, 1, 1)], 2, today); // way before the 2-week window
  assert.equal(r.sessions, 0);
});
