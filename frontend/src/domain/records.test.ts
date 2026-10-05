/** Run with: npm test — covers the records domain logic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeRecords,
  detectPrs,
  headlinePr,
  recordDeltaDisplay,
  recordDisplay,
  type PRSet,
  type PRSession,
} from './records.ts';

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

// A bodyweight-movement set (weight = added load; mover mass comes from session).
const bwset = (id: string, weight: number | null, reps: number, done = true): PRSet => ({
  id,
  type: 'normal',
  weight,
  reps,
  done,
  kind: 'bodyweight',
});

// --- computeRecords: bodyweight best_volume ---

test('best_volume counts the mover mass per session for bodyweight movements', () => {
  const sessions: PRSession[] = [
    // 80 kg mover: 80*10 + 80*8 = 1440
    { id: 'w1', achievedAt: at(3), bodyweightKg: 80, sets: [bwset('a', null, 10), bwset('b', null, 8)] },
    // 82 kg mover with +5 kg: (82+5)*6 = 522
    { id: 'w2', achievedAt: at(7), bodyweightKg: 82, sets: [bwset('c', 5, 6)] },
  ];
  const vol = computeRecords(sessions).best_volume!;
  assert.equal(vol.value, 1440);
  assert.equal(vol.workoutId, 'w1');
});

test('bodyweight best_volume is zero when the mover mass is unknown', () => {
  // No bodyweightKg on the session and no added load -> nothing to count.
  const sessions: PRSession[] = [{ id: 'w1', achievedAt: at(3), sets: [bwset('a', null, 10)] }];
  assert.equal(computeRecords(sessions).best_volume, undefined);
});

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

test('best_volume excludes warmups by default but includes them when countWarmups is on', () => {
  // Each session's warmup is 30 × 10 = 300.
  const off = computeRecords(benchHistory()).best_volume!;
  assert.equal(off.value, 1300); // warmup excluded
  assert.equal(off.workoutId, 'w2');

  const on = computeRecords(benchHistory(), true).best_volume!;
  // w1: 1253 + 300 = 1553; w2: 1300 + 300 = 1600 -> w2 still wins.
  assert.equal(on.value, 1600);
  assert.equal(on.workoutId, 'w2');
  assert.equal(on.display, '1,600 kg');
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

// --- recordDisplay / recordDeltaDisplay: stored kg prose in the user's unit ---

test('recordDisplay leaves a kg record reading as it was stored', () => {
  const recs = computeRecords(benchHistory());
  for (const r of Object.values(recs)) {
    assert.equal(recordDisplay(r.metric, r.value, r.display, 'kg'), r.display);
  }
  assert.equal(recordDisplay('max_reps', 11, 'BW × 11', 'kg'), 'BW × 11');
});

test('recordDisplay converts each weight-bearing metric to lb', () => {
  assert.equal(recordDisplay('best_set', 68, '68 × 5', 'lb'), '149.91 × 5');
  assert.equal(recordDisplay('est_1rm', 79.33, '79 kg', 'lb'), '175 lb');
  assert.equal(recordDisplay('best_volume', 1300, '1,300 kg', 'lb'), '2,866 lb');
  assert.equal(recordDisplay('max_reps', 15, '40 × 15', 'lb'), '88.18 × 15');
});

test('recordDisplay keeps a bodyweight rep record free of units', () => {
  assert.equal(recordDisplay('max_reps', 11, 'BW × 11', 'lb'), 'BW × 11');
});

test('a set logged in lb reads back as the lb that was typed', () => {
  // 225 lb x 5 is stored as 102.0583 kg, so the kg prose carries four decimals.
  const recs = computeRecords([session('w', 1, [wset('a', 'normal', 102.0583, 5)])]);
  const best = recs.best_set!;
  assert.equal(recordDisplay('best_set', best.value, best.display, 'lb'), '225 × 5');
  // ...and a kg reader gets it at display precision, not storage precision.
  assert.equal(recordDisplay('best_set', best.value, best.display, 'kg'), '102.06 × 5');
});

test('recordDisplay passes through prose it does not recognise', () => {
  assert.equal(recordDisplay('best_set', 68, '', 'lb'), '');
  assert.equal(recordDisplay('best_set', 68, 'n/a', 'lb'), 'n/a');
});

test('recordDeltaDisplay names the gain in the user unit', () => {
  assert.equal(recordDeltaDisplay('best_set', 3, 'kg'), '▲ 3 kg');
  assert.equal(recordDeltaDisplay('best_set', 3, 'lb'), '▲ 6.61 lb');
  assert.equal(recordDeltaDisplay('best_set', 2.268, 'lb'), '▲ 5 lb');
  assert.equal(recordDeltaDisplay('best_volume', 1000, 'lb'), '▲ 2,205 lb');
});

test('recordDeltaDisplay keeps reps as reps and a first record as NEW', () => {
  assert.equal(recordDeltaDisplay('max_reps', 1, 'lb'), '▲ 1 rep');
  assert.equal(recordDeltaDisplay('max_reps', 3, 'kg'), '▲ 3 reps');
  assert.equal(recordDeltaDisplay('best_set', null, 'lb'), 'NEW');
});

test('recordDeltaDisplay in kg matches what detectPrs writes', () => {
  const old = { best_set: 65, est_1rm: 75.83, best_volume: 1253, max_reps: 10 } as const;
  for (const p of detectPrs(old, computeRecords(benchHistory()))) {
    assert.equal(recordDeltaDisplay(p.metric, p.delta, 'kg'), p.deltaDisplay);
  }
});

// --- headlinePr ---

test('headline prefers best_set over others', () => {
  const prs = detectPrs({ best_set: 65, max_reps: 4 }, computeRecords(benchHistory()));
  assert.equal(headlinePr(prs)!.metric, 'best_set');
});

// --- est_1rm rep ceiling ---

test('a high-rep set does not outrank a heavier low-rep set for est_1rm', () => {
  // Raw Epley: 80x12 -> 112, 100x3 -> 110. The 12-rep set wins on the formula
  // alone, which is exactly where Epley stops being trustworthy.
  const recs = computeRecords([
    session('w1', 3, [wset('s1', 'normal', 80, 12), wset('s2', 'normal', 100, 3)]),
  ]);
  assert.equal(recs.est_1rm!.reps, 3);
  assert.equal(recs.est_1rm!.weight, 100);
});

test('est_1rm still uses a set at the rep ceiling', () => {
  const recs = computeRecords([
    session('w1', 3, [wset('s1', 'normal', 80, 10), wset('s2', 'normal', 60, 5)]),
  ]);
  assert.equal(recs.est_1rm!.reps, 10);
});

test('no est_1rm when every working set is above the rep ceiling', () => {
  const recs = computeRecords([
    session('w1', 3, [wset('s1', 'normal', 40, 15), wset('s2', 'normal', 40, 20)]),
  ]);
  assert.equal(recs.est_1rm, undefined);
  // The other metrics still stand — a high-rep session is a real session.
  assert.equal(recs.best_set!.value, 40);
  assert.equal(recs.max_reps!.value, 20);
});
