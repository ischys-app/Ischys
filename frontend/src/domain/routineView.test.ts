/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildRoutineView,
  estimateDurationSeconds,
  matchLastSets,
  routineCountsLabel,
  setText,
  type ViewExerciseIn,
} from './routineView.ts';

type SetIn = ViewExerciseIn['sets'][number];
const rset = (weight: number | null, reps: number | null, type: SetIn['type'] = 'normal'): SetIn => ({
  type,
  weight,
  reps,
});
const rex = (
  exerciseId: string,
  sets: SetIn[],
  extra: Partial<ViewExerciseIn> = {},
): ViewExerciseIn => ({
  id: `re-${exerciseId}-${Math.random()}`,
  exerciseId,
  name: exerciseId,
  initials: exerciseId.slice(0, 2).toUpperCase(),
  kind: 'weighted',
  equipment: 'dumbbell',
  restSeconds: 120,
  supersetGroup: null,
  note: null,
  sets,
  ...extra,
});
const done = (weight: number | null, reps: number | null, isDone = true) => ({
  weight,
  reps,
  done: isDone,
});

// --- meta line counts ---

test('counts are pluralised and an empty routine names no sets', () => {
  assert.equal(routineCountsLabel(6, 18), '6 EXERCISES · 18 SETS');
  assert.equal(routineCountsLabel(1, 3), '1 EXERCISE · 3 SETS');
  assert.equal(routineCountsLabel(1, 1), '1 EXERCISE · 1 SET');
  assert.equal(routineCountsLabel(2, 0), '2 EXERCISES · 0 SETS');
  assert.equal(routineCountsLabel(0, 0), '0 EXERCISES');
});

// --- estimated duration ---

test('never done has no estimate', () => {
  assert.equal(estimateDurationSeconds([]), null);
});

test('one run is rounded to the nearest five minutes', () => {
  assert.equal(estimateDurationSeconds([62 * 60]), 60 * 60);
  assert.equal(estimateDurationSeconds([63 * 60]), 65 * 60);
});

test('the median of three ignores the session where Finish was forgotten', () => {
  assert.equal(estimateDurationSeconds([64 * 60, 9 * 3600, 66 * 60]), 65 * 60);
});

test('two runs take the midpoint', () => {
  assert.equal(estimateDurationSeconds([50 * 60, 70 * 60]), 60 * 60);
});

test('only the three most recent runs count', () => {
  // Newest first: the fourth, much longer run is ignored.
  assert.equal(estimateDurationSeconds([30 * 60, 30 * 60, 30 * 60, 5 * 3600]), 30 * 60);
});

test('runs with no recorded duration are skipped, and a tiny one still shows five minutes', () => {
  assert.equal(estimateDurationSeconds([0, 0]), null);
  assert.equal(estimateDurationSeconds([0, 40 * 60]), 40 * 60);
  assert.equal(estimateDurationSeconds([60]), 5 * 60);
});

// --- target / last text ---

test('weighted sets read weight × reps in the user unit', () => {
  assert.equal(setText('weighted', 60, 8, 'kg'), '60 × 8');
  assert.equal(setText('weighted', 103.1923, 10, 'lb'), '227.5 × 10');
});

test('a missing value is a dash', () => {
  assert.equal(setText('weighted', null, 12, 'kg'), '— × 12');
  assert.equal(setText('weighted', 60, null, 'kg'), '60 × —');
});

test('bodyweight reads BW, or the added load with a plus', () => {
  assert.equal(setText('bodyweight', null, 10, 'kg'), 'BW × 10');
  assert.equal(setText('bodyweight', 0, 10, 'kg'), 'BW × 10');
  assert.equal(setText('bodyweight', 10, 6, 'kg'), '+10 × 6');
  assert.equal(setText('bodyweight', -20, 6, 'kg'), '−20 × 6');
});

// --- last-time matching ---

test('last time is matched by exercise and set order', () => {
  const routine = [rex('bench', [rset(60, 8), rset(60, 8)]), rex('row', [rset(70, 10)])];
  const last = [
    { exerciseId: 'row', sets: [done(70, 9)] },
    { exerciseId: 'bench', sets: [done(60, 8), done(60, 6)] },
  ];
  assert.deepEqual(matchLastSets(routine, last), [
    [done(60, 8), done(60, 6)],
    [done(70, 9)],
  ]);
});

test('unmatched sets and exercises are blank', () => {
  const routine = [rex('bench', [rset(60, 8), rset(60, 8), rset(60, 8)]), rex('curl', [rset(14, 10)])];
  const last = [{ exerciseId: 'bench', sets: [done(60, 8), done(60, 8, false)] }];
  assert.deepEqual(matchLastSets(routine, last), [[done(60, 8), null, null], [null]]);
});

test('a set ticked with nothing in it is blank', () => {
  const routine = [rex('bench', [rset(60, 8)])];
  assert.deepEqual(matchLastSets(routine, [{ exerciseId: 'bench', sets: [done(null, null)] }]), [[null]]);
});

test('an exercise listed twice matches its own occurrence', () => {
  const routine = [rex('bench', [rset(60, 8)]), rex('row', [rset(70, 10)]), rex('bench', [rset(40, 15)])];
  const last = [
    { exerciseId: 'bench', sets: [done(60, 7)] },
    { exerciseId: 'row', sets: [done(70, 10)] },
    { exerciseId: 'bench', sets: [done(40, 12)] },
  ];
  assert.deepEqual(matchLastSets(routine, last), [[done(60, 7)], [done(70, 10)], [done(40, 12)]]);
});

test('never done matches nothing', () => {
  assert.deepEqual(matchLastSets([rex('bench', [rset(60, 8)])], null), [[null]]);
});

// --- the screen model ---

test('badges number working sets and letter the rest', () => {
  const view = buildRoutineView(
    [rex('a', [rset(30, 10, 'warmup'), rset(60, 8), rset(60, 8), rset(40, 12, 'drop'), rset(40, null, 'failure')])],
    null,
    'kg',
  );
  assert.deepEqual(
    view[0].cards[0].sets.map((s) => s.badge),
    ['W', '1', '2', 'D', 'F'],
  );
});

test('a solo exercise carries its own rest and no tag', () => {
  const [block] = buildRoutineView([rex('a', [rset(60, 8)], { restSeconds: 150 })], null, 'kg');
  assert.equal(block.group, null);
  const card = block.cards[0];
  assert.equal(card.tag, null);
  assert.equal(card.equipment, 'Dumbbell');
  assert.deepEqual(card.rest, { kind: 'own', seconds: 150 });
  assert.equal(card.unitLabel, 'KG');
});

test('targets and last time are filled per set', () => {
  const [block] = buildRoutineView(
    [rex('pull', [rset(null, 10), rset(10, 6), rset(null, 8)], { kind: 'bodyweight', equipment: 'bodyweight' })],
    [{ exerciseId: 'pull', sets: [done(null, 11), done(10, 6)] }],
    'kg',
  );
  const card = block.cards[0];
  assert.equal(card.unitLabel, '+KG');
  assert.deepEqual(
    card.sets.map((s) => [s.target, s.last]),
    [
      ['BW × 10', 'BW × 11'],
      ['+10 × 6', '+10 × 6'],
      ['BW × 8', ''],
    ],
  );
});

test('pounds are shown when that is the unit', () => {
  const [block] = buildRoutineView([rex('a', [rset(103.1923, 10), rset(null, 12)])], null, 'lb');
  assert.equal(block.cards[0].unitLabel, 'LB');
  assert.deepEqual(
    block.cards[0].sets.map((s) => s.target),
    ['227.5 × 10', '— × 12'],
  );
});

test('superset partners share a block with rounds, tags and one rest', () => {
  const view = buildRoutineView(
    [
      rex('solo', [rset(60, 8)]),
      rex('bench', [rset(40, 10, 'warmup'), rset(80, 8), rset(80, 8), rset(80, 8)], { supersetGroup: 7 }),
      rex('row', [rset(70, 10), rset(70, 10)], { supersetGroup: 7, restSeconds: 90 }),
      rex('curl', [rset(14, 10)]),
    ],
    null,
    'kg',
  );
  assert.equal(view.length, 3);
  assert.equal(view[0].group, null);
  assert.deepEqual(view[1].group, { label: 'SUPERSET A', sub: '· 3 ROUNDS' });
  assert.deepEqual(
    view[1].cards.map((c) => [c.tag, c.rest]),
    [
      ['A1', { kind: 'then', tag: 'A2' }],
      ['A2', { kind: 'afterRound', seconds: 90 }],
    ],
  );
  assert.equal(view[2].group, null);
});

test('a single round is singular, and groups are lettered in order', () => {
  const view = buildRoutineView(
    [
      rex('a', [rset(1, 1)], { supersetGroup: 4 }),
      rex('b', [rset(1, 1)], { supersetGroup: 4 }),
      rex('c', [rset(1, 1)], { supersetGroup: 2 }),
      rex('d', [rset(1, 1)], { supersetGroup: 2 }),
    ],
    null,
    'kg',
  );
  assert.deepEqual(view.map((b) => b.group), [
    { label: 'SUPERSET A', sub: '· 1 ROUND' },
    { label: 'SUPERSET B', sub: '· 1 ROUND' },
  ]);
  assert.deepEqual(view[1].cards.map((c) => c.tag), ['B1', 'B2']);
});

test('a group of one is not a superset', () => {
  const [block] = buildRoutineView([rex('a', [rset(60, 8)], { supersetGroup: 3 })], null, 'kg');
  assert.equal(block.group, null);
  assert.equal(block.cards[0].tag, null);
  assert.deepEqual(block.cards[0].rest, { kind: 'own', seconds: 120 });
});

test('an empty routine has no blocks', () => {
  assert.deepEqual(buildRoutineView([], null, 'kg'), []);
});
