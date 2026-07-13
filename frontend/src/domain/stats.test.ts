/** Run with: npm test. Parity with backend/tests/test_stats.py. */
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

test('bodyweight set has zero kg volume', () => {
  // Pull Up: reps logged, no weight -> contributes 0 to kg volume.
  assert.equal(setVolume(s('normal', null, 10)), 0.0);
});

test('incomplete set has zero volume', () => {
  assert.equal(setVolume(s('normal', 60.0, 8, false)), 0.0);
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

test('session_metric est_1rm is max Epley', () => {
  // 80 * (1 + 12/30) = 112.0 beats 110 and 76.
  assert.equal(sessionMetric(session(), 'est_1rm'), 112.0);
});

test('session_metric best_volume sums working sets', () => {
  // 480 + 300 + 960, warmup excluded.
  assert.equal(sessionMetric(session(), 'best_volume'), 1740.0);
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
