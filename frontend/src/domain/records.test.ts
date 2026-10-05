/** Run with: npm test — covers the records domain logic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeRecords,
  countsTowardPrCount,
  detectPrs,
  headlinePr,
  recordDeltaDisplay,
  recordDisplay,
  walkPrFlags,
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

// --- walkPrFlags: a whole history, re-decided as finish would have ---

/**
 * What `finishWorkout` does for one exercise, without the database: the
 * records as materialised so far are the baseline, the session joins the
 * history (newest first, as `completedSessionsFor` returns it), the records
 * are recomputed, and whatever improved is flagged and counted.
 */
function logInOrder(sessions: PRSession[], countWarmups = false) {
  const flags = new Map<string, string[]>();
  const counted = new Map<string, boolean>();
  let materialised: ReturnType<typeof computeRecords> = {};
  const completed: PRSession[] = [];
  for (const sess of sessions.slice().sort((a, b) => a.achievedAt - b.achievedAt)) {
    const baseline: Record<string, number> = {};
    for (const rv of Object.values(materialised)) baseline[rv.metric] = rv.value;
    completed.push(sess);
    const computed = computeRecords(
      completed.slice().sort((a, b) => b.achievedAt - a.achievedAt),
      countWarmups,
    );
    const deltas = detectPrs(baseline, computed);
    const setIds = new Set(sess.sets.map((s) => s.id));
    const flagged: string[] = [];
    for (const d of deltas) {
      if (d.value.workoutSetId && setIds.has(d.value.workoutSetId) && !flagged.includes(d.value.workoutSetId)) {
        flagged.push(d.value.workoutSetId);
      }
    }
    flags.set(sess.id, flagged);
    counted.set(sess.id, headlinePr(deltas) !== null);
    materialised = computed;
  }
  return { flags, counted };
}

const assertWalkMatchesFinish = (sessions: PRSession[], countWarmups = false) => {
  const logged = logInOrder(sessions, countWarmups);
  const steps = walkPrFlags(sessions, countWarmups);
  assert.equal(steps.length, sessions.length);
  for (const step of steps) {
    assert.deepEqual(step.flaggedSetIds, logged.flags.get(step.sessionId), `flags of ${step.sessionId}`);
    assert.equal(step.deltas.length > 0, logged.counted.get(step.sessionId), `count of ${step.sessionId}`);
  }
  return steps;
};

const flagsOf = (steps: ReturnType<typeof walkPrFlags>) =>
  Object.fromEntries(steps.map((s) => [s.sessionId, s.flaggedSetIds.slice().sort()]));

/** Five sessions with a plateau, a tie, a warm-up heavier than any working set and an unticked set. */
const longHistory = (): PRSession[] => [
  session('w1', 1, [wset('a1', 'warmup', 90, 3), wset('a2', 'normal', 60, 8), wset('a3', 'normal', 65, 5)]),
  session('w2', 3, [wset('b1', 'normal', 60, 8), wset('b2', 'normal', 65, 5), wset('b3', 'normal', 65, 5)]),
  session('w3', 5, [wset('c1', 'normal', 68, 5), wset('c2', 'normal', 70, 2, false)]),
  session('w4', 7, [wset('d1', 'normal', 68, 6), wset('d2', 'drop', 40, 14)]),
  session('w5', 9, [wset('e1', 'failure', 66, 5)]),
];

test('the walk flags exactly what finishing each session in date order would have', () => {
  const steps = assertWalkMatchesFinish(longHistory());
  assert.deepEqual(flagsOf(steps), {
    // First ever: heaviest set and est. 1RM on a3, most reps on a2.
    w1: ['a2', 'a3'],
    // Same top set, more volume: a record with no set to flag.
    w2: [],
    w3: ['c1'],
    // 68 again is not a heavier set, but 68 × 6 is a better 1RM, and 14 reps a new most.
    w4: ['d1', 'd2'],
    w5: [],
  });
  assert.deepEqual(steps[1].deltas.map((d) => d.metric), ['best_volume']);
});

test('the walk reads sessions oldest first whatever order they arrive in', () => {
  const shuffled = [longHistory()[3], longHistory()[0], longHistory()[4], longHistory()[2], longHistory()[1]];
  assert.deepEqual(flagsOf(walkPrFlags(shuffled)), flagsOf(walkPrFlags(longHistory())));
  assert.deepEqual(walkPrFlags(shuffled).map((s) => s.sessionId), ['w1', 'w2', 'w3', 'w4', 'w5']);
});

test('the walk honours the warm-up setting and each session’s bodyweight, as finish does', () => {
  const dips: PRSession[] = [
    { id: 'w1', achievedAt: at(1), bodyweightKg: 80, sets: [bwset('a1', null, 10), bwset('a2', 10, 6)] },
    { id: 'w2', achievedAt: at(3), bodyweightKg: 84, sets: [bwset('b1', null, 10), bwset('b2', 10, 6)] },
    { id: 'w3', achievedAt: at(5), bodyweightKg: 0, sets: [bwset('c1', null, 12)] },
  ];
  const steps = assertWalkMatchesFinish(dips);
  // Same sets at a heavier bodyweight: more volume, nothing to flag.
  assert.deepEqual(steps[1].flaggedSetIds, []);
  assert.deepEqual(steps[1].deltas.map((d) => d.metric), ['best_volume']);
  assert.deepEqual(steps[2].flaggedSetIds, ['c1']);

  const warm: PRSession[] = [
    session('w1', 1, [wset('a1', 'warmup', 40, 10), wset('a2', 'normal', 60, 5)]),
    session('w2', 3, [wset('b1', 'warmup', 40, 12), wset('b2', 'normal', 60, 5)]),
  ];
  assert.deepEqual(assertWalkMatchesFinish(warm, false)[1].deltas, []);
  assert.deepEqual(assertWalkMatchesFinish(warm, true)[1].deltas.map((d) => d.metric), ['best_volume']);
});

test('lowering a past best promotes the later set that is now the record', () => {
  const before = flagsOf(walkPrFlags(longHistory()));
  assert.deepEqual(before.w3, ['c1']);
  assert.deepEqual(before.w5, []);
  // 68 × 5 on day 5 was a typo for 58 × 5, and so was day 7's 68.
  const edited = longHistory();
  edited[2] = session('w3', 5, [wset('c1', 'normal', 58, 5), wset('c2', 'normal', 70, 2, false)]);
  edited[3] = session('w4', 7, [wset('d1', 'normal', 58, 6), wset('d2', 'drop', 40, 14)]);
  const after = flagsOf(assertWalkMatchesFinish(edited));
  assert.deepEqual(after.w3, []);
  assert.deepEqual(after.w5, ['e1']);
});

test('raising a past best demotes the later sets it now beats', () => {
  const edited = longHistory();
  edited[0] = session('w1', 1, [wset('a1', 'warmup', 90, 3), wset('a2', 'normal', 60, 8), wset('a3', 'normal', 75, 5)]);
  const after = flagsOf(assertWalkMatchesFinish(edited));
  assert.deepEqual(after.w3, []);
  assert.deepEqual(after.w4, ['d2']);
});

test('moving a session in time re-decides the sessions it now sits between', () => {
  // The 68 × 6 day moves ahead of the 68 × 5 day, which then sets nothing.
  const moved = longHistory();
  moved[3] = { ...moved[3], achievedAt: at(4) };
  const after = flagsOf(assertWalkMatchesFinish(moved));
  assert.deepEqual(after.w4, ['d1', 'd2']);
  assert.deepEqual(after.w3, []);
});

test('a workout’s PR count holds an exercise only where the stored data says so', () => {
  const [first, volumeOnly] = walkPrFlags(longHistory());
  // A flagged set counts.
  assert.equal(countsTowardPrCount(first, true, 1), true);
  // A volume record has no set to flag, and counts where the count has room.
  assert.equal(countsTowardPrCount(volumeOnly, false, 1), true);
  // Imported without flags: the count is zero, so nothing is held.
  assert.equal(countsTowardPrCount(first, false, 0), false);
  assert.equal(countsTowardPrCount(volumeOnly, false, 0), false);
  // The walk would flag a set here but none is stored: not counted.
  assert.equal(countsTowardPrCount(first, false, 2), false);
  // An exercise the workout no longer has a session for.
  assert.equal(countsTowardPrCount(undefined, false, 1), false);
});
