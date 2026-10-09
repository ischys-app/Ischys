/** Run with: npm test — covers the stats domain logic. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  countWorkingSets,
  estimated1rm,
  sessionMetric,
  setVolume,
  workoutVolume,
  type SetLike,
} from './stats.ts';

const s = (
  type: string,
  weight: number | null,
  reps: number | null,
  done = true,
): SetLike => ({ type, weight, reps, done });

// --- estimated1rm (Epley) ---

test('est_1rm single rep equals weight', () => {
  assert.equal(estimated1rm(100.0, 1), 100.0);
});

test('est_1rm Epley formula', () => {
  // 60 * (1 + 8/30) = 76.0
  assert.equal(estimated1rm(60.0, 8), 76.0);
});

test('est_1rm null when no weight', () => {
  assert.equal(estimated1rm(null, 5), null);
});

test('est_1rm null when no reps', () => {
  assert.equal(estimated1rm(80.0, null), null);
  assert.equal(estimated1rm(80.0, 0), null);
});

// --- setVolume ---

test('set_volume normal', () => {
  assert.equal(setVolume(s('normal', 60.0, 8)), 480.0);
});

test('set_volume drop and failure count', () => {
  assert.equal(setVolume(s('drop', 40.0, 12)), 480.0);
  assert.equal(setVolume(s('failure', 50.0, 5)), 250.0);
});

test('warmup volume is zero', () => {
  assert.equal(setVolume(s('warmup', 60.0, 10)), 0.0);
});

test('warmup counts toward volume when countWarmups is on', () => {
  // Off (default) -> 0; on -> weight × reps like any working set.
  assert.equal(setVolume(s('warmup', 60.0, 10), 0, false), 0.0);
  assert.equal(setVolume(s('warmup', 60.0, 10), 0, true), 600.0);
});

test('warmup bodyweight set counts the mover mass only when countWarmups is on', () => {
  const warmupBw: SetLike = { type: 'warmup', weight: null, reps: 10, done: true, kind: 'bodyweight' };
  assert.equal(setVolume(warmupBw, 80, false), 0);
  assert.equal(setVolume(warmupBw, 80, true), 800);
});

test('bodyweight set has zero kg volume', () => {
  // Pull Up: reps logged, no weight -> contributes 0 to kg volume.
  assert.equal(setVolume(s('normal', null, 10)), 0.0);
});

test('incomplete set has zero volume', () => {
  assert.equal(setVolume(s('normal', 60.0, 8, false)), 0.0);
});

// --- setVolume for bodyweight movements ---

const bw = (weight: number | null, reps: number | null, done = true): SetLike => ({
  type: 'normal',
  weight,
  reps,
  done,
  kind: 'bodyweight',
});

test('bodyweight set counts bodyweight + added load', () => {
  // 80 kg mover, +10 kg belt, 8 reps -> (80+10)*8
  assert.equal(setVolume(bw(10, 8), 80), 720);
});

test('pure bodyweight set uses the mover mass', () => {
  // 80 kg mover, no added load, 12 reps -> 80*12
  assert.equal(setVolume(bw(null, 12), 80), 960);
});

test('assisted bodyweight subtracts the assist, floored at zero', () => {
  assert.equal(setVolume(bw(-30, 10), 80), 500); // (80-30)*10
  assert.equal(setVolume(bw(-100, 10), 80), 0); // assist exceeds bodyweight -> 0
});

test('bodyweight set with unknown bodyweight falls back to added load only', () => {
  assert.equal(setVolume(bw(null, 12)), 0); // no mass, no added -> 0 (pre-feature)
  assert.equal(setVolume(bw(10, 8)), 80); // only the added load counts
});

test('warmup/incomplete bodyweight sets stay zero', () => {
  assert.equal(setVolume({ type: 'warmup', weight: null, reps: 10, done: true, kind: 'bodyweight' }, 80), 0);
  assert.equal(setVolume(bw(null, 10, false), 80), 0);
});

test('workout_volume includes bodyweight movements at the given mass', () => {
  const sets = [s('normal', 60, 8), bw(null, 10), bw(10, 5)];
  assert.equal(workoutVolume(sets, 80), 480 + 800 + 450);
});

test('best_volume session metric includes bodyweight mass', () => {
  assert.equal(sessionMetric([bw(null, 10), bw(null, 8)], 'best_volume', 80), 1440);
});

// --- workoutVolume / countWorkingSets ---

test('workout_volume sums only completed working sets', () => {
  const sets = [
    s('warmup', 30.0, 10), // excluded (warmup)
    s('normal', 60.0, 8), // 480
    s('normal', 60.0, 8), // 480
    s('normal', 65.0, 5, false), // excluded (not done)
    s('normal', null, 10), // bodyweight -> 0 kg
  ];
  assert.equal(workoutVolume(sets), 960.0);
});

test('workout_volume includes warmups only when countWarmups is on', () => {
  const sets = [
    s('warmup', 30.0, 10), // 300 when counted
    s('normal', 60.0, 8), // 480
  ];
  assert.equal(workoutVolume(sets), 480.0); // default off
  assert.equal(workoutVolume(sets, 0, false), 480.0);
  assert.equal(workoutVolume(sets, 0, true), 780.0); // 300 + 480
});

test('countWarmups does not change the working-set count', () => {
  const sets = [s('warmup', 30.0, 10), s('normal', 60.0, 8)];
  // The SETS stat stays working-only regardless — only VOLUME counts warmups.
  assert.equal(countWorkingSets(sets), 1);
});

test('count_working_sets excludes warmups and undone', () => {
  const sets = [
    s('warmup', 30.0, 10),
    s('normal', 60.0, 8),
    s('drop', 40.0, 10),
    s('normal', 65.0, 5, false),
    s('normal', null, 10), // bodyweight working set still counts
  ];
  assert.equal(countWorkingSets(sets), 3);
});

// --- sessionMetric (per-exercise chart points) ---

function session(): SetLike[] {
  // A mixed session: a warmup (ignored) plus three working sets.
  return [
    s('warmup', 40.0, 10), // excluded everywhere
    s('normal', 60.0, 8), // vol 480, 1RM 76, weight 60
    s('normal', 100.0, 3), // vol 300, 1RM 110, weight 100 (heaviest)
    s('normal', 80.0, 12), // vol 960, 1RM 112 (top), reps 12 (most)
  ];
}

test('session_metric best_set is heaviest working weight', () => {
  assert.equal(sessionMetric(session(), 'best_set'), 100.0);
});

test('session_metric est_1rm is max Epley within the rep ceiling', () => {
  // Raw Epley would hand this to the 12-rep set (80 * (1 + 12/30) = 112), which
  // is where the formula stops predicting a single. Capped at 10 reps, the
  // 100 x 3 set takes it at 110 — matching what computeRecords calls the PR.
  assert.equal(sessionMetric(session(), 'est_1rm'), 110.0);
});

test('session_metric est_1rm is null when every working set is above the ceiling', () => {
  assert.equal(sessionMetric([s('normal', 40.0, 15), s('normal', 45.0, 12)], 'est_1rm'), null);
});

test('session_metric best_volume sums working sets', () => {
  // 480 + 300 + 960, warmup excluded.
  assert.equal(sessionMetric(session(), 'best_volume'), 1740.0);
});

test('session_metric best_volume adds the warmup when countWarmups is on', () => {
  // The warmup is 40 × 10 = 400 on top of 1740.
  assert.equal(sessionMetric(session(), 'best_volume', 0, true), 2140.0);
});

test('session_metric best_volume counts a warmup-only session when countWarmups is on', () => {
  const sets = [s('warmup', 40.0, 10)];
  assert.equal(sessionMetric(sets, 'best_volume'), null); // off: nothing to plot
  assert.equal(sessionMetric(sets, 'best_volume', 0, true), 400.0);
});

test('session_metric max_reps is top working reps', () => {
  assert.equal(sessionMetric(session(), 'max_reps'), 12.0);
});

test('session_metric unknown falls back to est_1rm', () => {
  assert.equal(sessionMetric(session(), 'bogus'), sessionMetric(session(), 'est_1rm'));
});

test('session_metric none when no working sets', () => {
  const sets = [s('warmup', 40.0, 10), s('normal', 60.0, 8, false)];
  assert.equal(sessionMetric(sets, 'best_volume'), null);
});

test('session_metric bodyweight has reps but no weight metric', () => {
  // Pull-ups: reps only. max_reps works; weight metrics have no data.
  const sets = [s('normal', null, 10), s('normal', null, 8)];
  assert.equal(sessionMetric(sets, 'max_reps'), 10.0);
  assert.equal(sessionMetric(sets, 'best_set'), null);
  assert.equal(sessionMetric(sets, 'best_volume'), null);
});

test('a weight typed in pounds charts as the number typed', () => {
  // 225 lb is stored as 102.0583 kg. Rounded to a tenth of a kilogram first,
  // it came back as 225.1 lb; so did 100 lb (100.1) and 135 lb (134.9).
  const LB = 0.45359237;
  for (const lb of [45, 100, 135, 225, 315]) {
    const kg = Math.round(lb * LB * 10000) / 10000;
    const best = sessionMetric([s('normal', kg, 5)], 'best_set') as number;
    assert.equal(Math.round((best / LB) * 10) / 10, lb, `best set ${lb} lb`);
    const single = sessionMetric([s('normal', kg, 1)], 'est_1rm') as number;
    assert.equal(Math.round((single / LB) * 10) / 10, lb, `single at ${lb} lb`);
  }
});
