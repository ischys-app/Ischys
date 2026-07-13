/** Run with: npm test — covers the records domain logic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeRecords, detectPrs, headlinePr, type PRSet, type PRSession } from './records.ts';

const at = (day: number) => Date.UTC(2026, 6, day, 9);
const wset = (id: string, type: string, weight: number | null, reps: number | null, done = true): PRSet => ({
  id,
  type,
  weight,
  reps,
  done,
});
const session = (id: string, day: number, sets: PRSet[]): PRSession => ({ id, achievedAt: at(day), sets });

// A two-session incline-bench history (kg).
const benchHistory = (): PRSession[] => [
  session('w1', 3, [
    wset('s1', 'warmup', 30, 10), // excluded
    wset('s2', 'normal', 58, 8),
    wset('s3', 'normal', 58, 8),
    wset('s4', 'normal', 65, 5),
  ]),
  session('w2', 7, [
    wset('s5', 'warmup', 30, 10), // excluded
    wset('s6', 'normal', 60, 8),
    wset('s7', 'normal', 60, 8),
    wset('s8', 'normal', 68, 5), // new best set
  ]),
];

// --- computeRecords ---

test('best_set is the heaviest working set', () => {
  const best = computeRecords(benchHistory()).best_set!;
  assert.equal(best.value, 68);
  assert.equal(best.reps, 5);
  assert.equal(best.workoutSetId, 's8');
  assert.equal(best.display, '68 × 5');
});

test('best_set ignores warmups', () => {
  const recs = computeRecords([
    session('w', 1, [wset('a', 'warmup', 200, 1), wset('b', 'normal', 60, 8)]),
  ]);
  assert.equal(recs.best_set!.value, 60);
});

test('est_1rm is the max Epley across sets', () => {
  const recs = computeRecords(benchHistory());
  assert.equal(recs.est_1rm!.value, 79.33); // 68*(1+5/30)=79.33 beats 60x8->76
  assert.equal(recs.est_1rm!.display, '79 kg');
});

test('best_volume is the max single-session volume', () => {
  const bv = computeRecords(benchHistory()).best_volume!;
  assert.equal(bv.value, 1300); // w2: 60*8+60*8+68*5=1300 > w1 1253
  assert.equal(bv.workoutId, 'w2');
  assert.equal(bv.display, '1,300 kg');
});

test('max_reps tracks the highest-rep set', () => {
  const mr = computeRecords([
    session('w', 1, [wset('a', 'normal', 60, 8), wset('b', 'normal', 40, 15)]),
  ]).max_reps!;
  assert.equal(mr.value, 15);
  assert.equal(mr.display, '40 × 15');
});

test('max_reps bodyweight display', () => {
  const recs = computeRecords([session('w', 1, [wset('a', 'normal', null, 11)])]);
  assert.equal(recs.max_reps!.display, 'BW × 11');
});

test('empty history returns no records', () => {
  assert.deepEqual(computeRecords([]), {});
});

test('history with only warmups returns no records', () => {
  assert.deepEqual(computeRecords([session('w', 1, [wset('a', 'warmup', 40, 10)])]), {});
});

// --- detectPrs ---

test('detectPrs flags improved metrics with delta', () => {
  const old = { best_set: 65, est_1rm: 75.83, best_volume: 1253, max_reps: 10 } as const;
  const prs = detectPrs(old, computeRecords(benchHistory()));
  const best = prs.find((p) => p.metric === 'best_set')!;
  assert.ok(best);
  assert.equal(best.previous, 65);
  assert.equal(best.delta, 3);
  assert.equal(best.deltaDisplay, '▲ 3 kg');
});

test('detectPrs treats a first-ever record as a PR', () => {
  const newRecs = computeRecords(benchHistory());
  const prs = detectPrs({}, newRecs);
  assert.deepEqual(new Set(prs.map((p) => p.metric)), new Set(Object.keys(newRecs)));
  assert.ok(prs.every((p) => p.previous === null));
  assert.ok(prs.every((p) => p.deltaDisplay === 'NEW'));
});

test('detectPrs returns empty when nothing improved', () => {
  const newRecs = computeRecords(benchHistory());
  const old = Object.fromEntries(Object.entries(newRecs).map(([m, v]) => [m, v!.value]));
  assert.deepEqual(detectPrs(old, newRecs), []);
});

test('max_reps delta uses rep units', () => {
  const newRecs = computeRecords([session('w', 1, [wset('a', 'normal', 25, 13)])]);
  const pr = detectPrs({ max_reps: 12 }, { max_reps: newRecs.max_reps })[0];
  assert.equal(pr.deltaDisplay, '▲ 1 rep');
});

// --- headlinePr ---

test('headline prefers best_set over others', () => {
  const prs = detectPrs({ best_set: 65, max_reps: 4 }, computeRecords(benchHistory()));
  assert.equal(headlinePr(prs)!.metric, 'best_set');
});
