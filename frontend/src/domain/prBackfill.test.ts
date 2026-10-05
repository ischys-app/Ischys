/** Run with: npm test — the whole-database PR flag pass (#91). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PR_BACKFILL_VERSION,
  decidePrBackfill,
  planPrBackfill,
  prHistories,
  type PrSetRow,
} from './prBackfill.ts';
import { countsTowardPrCount, walkPrFlags } from './records.ts';

const DAY = 86_400_000;
const at = (day: number) => Date.UTC(2026, 0, day, 9);

/** One stored set of a completed workout; `w3` is logged on day 3. */
function row(
  workoutId: string,
  exerciseId: string,
  setId: string,
  weight: number | null,
  reps: number | null,
  over: Partial<PrSetRow> = {},
): PrSetRow {
  return {
    setId,
    workoutId,
    exerciseId,
    startedAt: at(Number(workoutId.slice(1))),
    bodyweightKg: null,
    exercisePosition: 0,
    position: Number(setId.replace(/\D/g, '')) || 0,
    type: 'normal',
    weight,
    reps,
    done: true,
    isPr: false,
    ...over,
  };
}

const plan = (
  rows: PrSetRow[],
  prCounts: Record<string, number>,
  over: { currentBw?: number | null; countWarmups?: boolean; kinds?: Record<string, 'weighted' | 'bodyweight'> } = {},
) =>
  planPrBackfill({
    rows,
    prCounts: new Map(Object.entries(prCounts)),
    kinds: new Map(Object.entries(over.kinds ?? {})),
    currentBw: over.currentBw ?? null,
    countWarmups: over.countWarmups ?? false,
  });

/** The database after a plan is written to it. */
function apply(rows: PrSetRow[], prCounts: Record<string, number>, p: ReturnType<typeof plan>) {
  const raise = new Set(p.raise);
  const lower = new Set(p.lower);
  return {
    rows: rows.map((r) => ({ ...r, isPr: raise.has(r.setId) ? true : lower.has(r.setId) ? false : r.isPr })),
    prCounts: { ...prCounts, ...Object.fromEntries(p.prCounts) },
  };
}

/**
 * Bench and squat over three workouts, as an import leaves them: no flags.
 *  w1  bench 60×5 (first ever)            squat 100×5 (first ever)
 *  w2  bench 60×5, 60×5 (volume only)     squat 100×5 (nothing)
 *  w3  bench 65×5 (heavier)               —
 */
const imported = (): PrSetRow[] => [
  row('w1', 'bench', 's1', 60, 5),
  row('w1', 'squat', 's2', 100, 5),
  row('w2', 'bench', 's3', 60, 5),
  row('w2', 'bench', 's4', 60, 5),
  row('w2', 'squat', 's5', 100, 5),
  row('w3', 'bench', 's6', 65, 5),
];
const zero = { w1: 0, w2: 0, w3: 0 };

// --- the flags ---------------------------------------------------------------

test('history imported without flags gets the flags a date-ordered log would have', () => {
  const p = plan(imported(), zero);
  assert.deepEqual(p.raise.slice().sort(), ['s1', 's2', 's6']);
  assert.deepEqual(p.lower, []);
});

test('a flag the walk does not give is taken away, and one it does give is left alone', () => {
  const rows = imported();
  rows[0].isPr = true; // s1: right
  rows[4].isPr = true; // s5: a plateau, never a record
  const p = plan(rows, zero);
  assert.deepEqual(p.lower, ['s5']);
  assert.deepEqual(p.raise.slice().sort(), ['s2', 's6']);
});

test('each exercise is walked on its own, in date order, whatever order the rows arrive in', () => {
  const shuffled = imported().reverse();
  assert.deepEqual(plan(shuffled, zero).raise.slice().sort(), ['s1', 's2', 's6']);
});

// --- the counts --------------------------------------------------------------

test('a workout’s count is the number of its exercises that set a record', () => {
  const p = plan(imported(), zero);
  // w1: both lifts for the first time. w2: bench by volume alone — a record
  // with no set to flag still counts, as it does at finish. w3: bench.
  assert.deepEqual(Object.fromEntries(p.prCounts), { w1: 2, w2: 1, w3: 1 });
});

test('counts are rebuilt from the walk, whatever was stored', () => {
  const rows = imported();
  const stored = { w1: 0, w2: 7, w3: 1 };
  const after = apply(rows, stored, plan(rows, stored));
  assert.deepEqual(after.prCounts, { w1: 2, w2: 1, w3: 1 });
});

test('only the workouts whose count is wrong are written', () => {
  const p = plan(imported(), { w1: 2, w2: 0, w3: 1 });
  assert.deepEqual(Object.fromEntries(p.prCounts), { w2: 1 });
});

test('a workout that set no record, or has no sets left at all, counts zero', () => {
  const rows = [row('w1', 'bench', 's1', 60, 5), row('w2', 'bench', 's2', 60, 5)];
  // w9 is a completed workout with no sets: it is in the counts and in no row.
  const p = plan(rows, { w1: 1, w2: 3, w9: 2 });
  assert.deepEqual(Object.fromEntries(p.prCounts), { w2: 0, w9: 0 });
});

test('an exercise logged twice in one workout is one session and counts once', () => {
  const rows = [
    row('w1', 'bench', 's1', 60, 5, { exercisePosition: 0 }),
    row('w1', 'bench', 's2', 70, 3, { exercisePosition: 2 }),
  ];
  const p = plan(rows, { w1: 0 });
  assert.deepEqual(Object.fromEntries(p.prCounts), { w1: 1 });
  // Heaviest set and best estimated max on the 70; most reps on the 60.
  assert.deepEqual(p.raise.slice().sort(), ['s1', 's2']);
});

test('the pass is idempotent: a second run has nothing to write', () => {
  const rows = imported();
  rows[4].isPr = true;
  const stored = { w1: 5, w2: 0, w3: 0 };
  const after = apply(rows, stored, plan(rows, stored));
  const again = plan(after.rows, after.prCounts);
  assert.deepEqual(again.raise, []);
  assert.deepEqual(again.lower, []);
  assert.equal(again.prCounts.size, 0);
});

/**
 * What adjusting counts exercise by exercise does — `prCountHolders` before,
 * `reflagExercisePrs` after, as an edit runs them — replayed without the
 * database. It moves a count by one where an exercise starts or stops holding
 * a record, and so can only be as right as the count it started from.
 */
function byDeltas(rows: PrSetRow[], prCounts: Record<string, number>) {
  const counts = { ...prCounts };
  const moves: { workoutId: string; by: 1 | -1 }[] = [];
  // Every exercise's holders are read first, against the data as stored …
  for (const [exerciseId, sessions] of prHistories(rows, new Map(), null)) {
    const steps = new Map(walkPrFlags(sessions).map((s) => [s.sessionId, s]));
    for (const sess of sessions) {
      const step = steps.get(sess.id);
      const flagged = rows.some((r) => r.exerciseId === exerciseId && r.workoutId === sess.id && r.isPr);
      const held = countsTowardPrCount(step, flagged, prCounts[sess.id] ?? 0);
      const holds = (step?.deltas.length ?? 0) > 0;
      if (held !== holds) moves.push({ workoutId: sess.id, by: holds ? 1 : -1 });
    }
  }
  // … and only then is each count moved.
  for (const m of moves) counts[m.workoutId] = Math.max(0, (counts[m.workoutId] ?? 0) + m.by);
  return counts;
}

test('from a consistent start, adjusting by deltas and rebuilding agree', () => {
  // Imported history: no flags and zero counts, which is consistent.
  const rows = imported();
  assert.deepEqual(byDeltas(rows, zero), apply(rows, zero, plan(rows, zero)).prCounts);
});

test('from an inconsistent start, only rebuilding ends at what the flags imply', () => {
  // w1 as a backup restores it after an edit elsewhere touched bench only:
  // bench is flagged and counted, squat has neither. w2 carries a stale count.
  const rows = imported();
  rows[0].isPr = true;
  const stored = { w1: 1, w2: 4, w3: 0 };
  const implied = { w1: 2, w2: 1, w3: 1 };

  assert.deepEqual(apply(rows, stored, plan(rows, stored)).prCounts, implied);

  const drifted = byDeltas(rows, stored);
  // The stale 4 is only ever nudged, never replaced.
  assert.notEqual(drifted.w2, implied.w2);
  assert.notDeepEqual(drifted, implied);
});

test('a volume record another exercise’s count is mistaken for is still counted', () => {
  // w2 holds one PR, bench's flagged set. Squat also set a record there, by
  // volume alone, with no set to flag: by deltas it reads as the one already
  // counted and the workout stays at 1. Rebuilt, it is 2.
  const rows = [
    row('w1', 'bench', 's1', 60, 5),
    row('w1', 'squat', 's2', 100, 5),
    row('w2', 'bench', 's3', 65, 5, { isPr: true }),
    row('w2', 'squat', 's4', 100, 5),
    row('w2', 'squat', 's5', 100, 5),
  ];
  const stored = { w1: 0, w2: 1 };
  assert.equal(byDeltas(rows, stored).w2, 1);
  assert.equal(apply(rows, stored, plan(rows, stored)).prCounts.w2, 2);
});

// --- what the walk is fed ----------------------------------------------------

test('sets reach the walk in workout order, so a tie stars the set logged first', () => {
  const rows = [
    row('w1', 'bench', 's2', 60, 5, { position: 1 }),
    row('w1', 'bench', 's1', 60, 5, { position: 0 }),
  ];
  assert.deepEqual(plan(rows, { w1: 0 }).raise, ['s1']);
  const [session] = prHistories(rows, new Map(), null).get('bench')!;
  assert.deepEqual(session.sets.map((s) => s.id), ['s1', 's2']);
});

test('sessions sharing an instant are walked in a fixed order', () => {
  const a = [row('w1', 'bench', 's1', 60, 5), row('w2', 'bench', 's2', 60, 5, { startedAt: at(1) })];
  const first = plan(a, { w1: 0, w2: 0 });
  const second = plan(a.slice().reverse(), { w1: 0, w2: 0 });
  assert.deepEqual(first.raise, ['s1']);
  assert.deepEqual(second.raise, ['s1']);
});

test('a bodyweight movement counts the mass each workout recorded, else today’s', () => {
  const kinds = { dip: 'bodyweight' as const };
  const rows = [
    row('w1', 'dip', 's1', null, 10, { bodyweightKg: 80 }),
    row('w2', 'dip', 's2', null, 10, { bodyweightKg: 84 }),
    row('w3', 'dip', 's3', null, 10),
  ];
  // w2: same reps at a heavier bodyweight, a volume record. w3 has no
  // snapshot: at today's 90 kg it is another, at an unknown mass it is not.
  assert.deepEqual(Object.fromEntries(plan(rows, zero, { kinds, currentBw: 90 }).prCounts), { w1: 1, w2: 1, w3: 1 });
  assert.deepEqual(Object.fromEntries(plan(rows, zero, { kinds }).prCounts), { w1: 1, w2: 1 });
});

test('the warm-up setting reaches the walk', () => {
  const rows = [
    row('w1', 'bench', 's1', 60, 5),
    row('w2', 'bench', 's2', 40, 10, { type: 'warmup' }),
    row('w2', 'bench', 's3', 60, 5),
  ];
  const stored = { w1: 0, w2: 0 };
  assert.deepEqual(Object.fromEntries(plan(rows, stored).prCounts), { w1: 1 });
  assert.deepEqual(Object.fromEntries(plan(rows, stored, { countWarmups: true }).prCounts), { w1: 1, w2: 1 });
});

test('a database-sized history is planned quickly', () => {
  // 1,500 workouts of 6 exercises and 4 sets, over 150 exercises — a few of
  // them in most workouts, as a real log has.
  const rows: PrSetRow[] = [];
  const counts: Record<string, number> = {};
  for (let w = 0; w < 1500; w++) {
    counts[`w${w}`] = 0;
    for (let e = 0; e < 6; e++) {
      const exerciseId = e < 3 ? `main${(w + e) % 5}` : `acc${(w * 7 + e * 13) % 145}`;
      for (let s = 0; s < 4; s++) {
        rows.push({
          setId: `w${w}e${e}s${s}`,
          workoutId: `w${w}`,
          exerciseId,
          startedAt: w * DAY,
          bodyweightKg: null,
          exercisePosition: e,
          position: s,
          type: s === 0 ? 'warmup' : 'normal',
          weight: 40 + ((w * 31 + e * 17 + s) % 60),
          reps: 3 + ((w + s) % 10),
          done: true,
          isPr: false,
        });
      }
    }
  }
  assert.equal(rows.length, 36_000);
  const t0 = performance.now();
  const p = plan(rows, counts);
  const elapsed = performance.now() - t0;
  assert.ok(p.raise.length > 0);
  assert.ok(elapsed < 500, `planning took ${elapsed.toFixed(0)} ms`);
});

// --- running once ------------------------------------------------------------

test('the pass runs when it never has and there is history', () => {
  assert.equal(decidePrBackfill(null, 12), 'run');
  assert.equal(decidePrBackfill('', 1), 'run');
});

test('it never runs again once its version is recorded', () => {
  assert.equal(decidePrBackfill(String(PR_BACKFILL_VERSION), 12), 'skip');
  assert.equal(decidePrBackfill(String(PR_BACKFILL_VERSION), 0), 'skip');
});

test('an empty database is marked done without running: nothing in it can be unflagged', () => {
  assert.equal(decidePrBackfill(null, 0), 'mark');
});

test('a later version of the pass runs once more over an earlier one', () => {
  assert.equal(decidePrBackfill('1', 12, 2), 'run');
  assert.equal(decidePrBackfill('2', 12, 2), 'skip');
  // A build older than the one that last ran has nothing to redo.
  assert.equal(decidePrBackfill('3', 12, 2), 'skip');
});

test('a marker that cannot be read as a version counts as never run', () => {
  assert.equal(decidePrBackfill('done', 3), 'run');
  assert.equal(decidePrBackfill('NaN', 0), 'mark');
});
