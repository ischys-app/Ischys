/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PRSession } from './records.ts';
import {
  activeExercises,
  addExercise,
  addSet,
  buildPlan,
  canSave,
  clampWhen,
  cycleSetType,
  durationFromParts,
  durationParts,
  editSetReps,
  editSetWeight,
  endsAt,
  hasChanges,
  joinSuperset,
  leaveSuperset,
  markSetDone,
  openEditSession,
  recordImpact,
  recordLine,
  recordRow,
  removeExercise,
  removeSet,
  reorderExercises,
  replaceExercise,
  setWhen,
  startFromParts,
  startParts,
  undoRemoveExercise,
  wasLabel,
  type OriginalExercise,
  type OriginalSet,
  type OriginalWorkout,
} from './workoutEdit.ts';

// --- fixtures ----------------------------------------------------------------

type T = 'normal' | 'warmup' | 'drop' | 'failure';

const oSet = (
  id: string,
  weight: number | null,
  reps: number | null,
  type: T = 'normal',
  extra: Partial<OriginalSet> = {},
): OriginalSet => ({ id, type, weight, reps, done: true, rpe: null, ...extra });

const oEx = (
  id: string,
  sets: OriginalSet[],
  extra: Partial<OriginalExercise> = {},
): OriginalExercise => ({
  id: `we-${id}`,
  exerciseId: id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  equipment: 'dumbbell',
  kind: 'weighted',
  rest: 120,
  note: '',
  supersetGroup: null,
  sets,
  ...extra,
});

/** Local noon on 7 Jul 2026, so a date label never depends on the zone. */
const START = new Date(2026, 6, 7, 9, 6).getTime();
const NOW = new Date(2026, 9, 5, 12, 0).getTime();

const workout = (exercises: OriginalExercise[], extra: Partial<OriginalWorkout> = {}): OriginalWorkout => ({
  id: 'w1',
  name: 'Temp Upper',
  startedAt: START,
  durationSeconds: 34_873, // 9:41 and 13 seconds — Finish was never tapped
  endedAt: START + 34_873_000,
  exercises,
  ...extra,
});

const incline = () =>
  oEx('incline', [
    oSet('s1', 32, 10, 'warmup'),
    oSet('s2', 60, 8),
    oSet('s3', 60, 6),
    oSet('s4', 68, 5),
  ]);

const pullUp = () =>
  oEx('pullup', [oSet('p1', null, 11), oSet('p2', 10, 8)], { kind: 'bodyweight', equipment: 'bodyweight' });

const open = (exercises: OriginalExercise[] = [incline(), pullUp()], unit: 'kg' | 'lb' = 'kg') =>
  openEditSession(workout(exercises), unit);

const chosen = (id: string) => ({
  id,
  name: id,
  initials: id.slice(0, 2).toUpperCase(),
  equipment: 'barbell',
  kind: 'weighted' as const,
});

// --- opening -----------------------------------------------------------------

test('a freshly opened session has no changes and cannot be saved', () => {
  const s = open();
  assert.equal(hasChanges(s), false);
  assert.equal(canSave(s), false);
  const plan = buildPlan(s);
  assert.equal(plan.changeCount, 0);
  assert.deepEqual(plan.updatedSets, []);
  assert.deepEqual(plan.updatedExercises, []);
  assert.equal(plan.startedAt, null);
  assert.equal(plan.durationSeconds, null);
  assert.equal(plan.endedAt, null);
});

test('weights open in the user unit', () => {
  const s = openEditSession(workout([oEx('bench', [oSet('b1', 102.0583, 5)])]), 'lb');
  assert.equal(s.exercises[0].sets[0].weight, '225');
  assert.equal(s.exercises[0].sets[0].reps, '5');
});

test('stored positions with gaps are not a change', () => {
  // A live session that had a set deleted mid-way can leave positions 0, 2, 3.
  const gappy = oEx('row', [
    oSet('r1', 30, 10, 'normal', { position: 0 }),
    oSet('r2', 30, 9, 'normal', { position: 2 }),
    oSet('r3', 30, 8, 'normal', { position: 3 }),
  ]);
  let s = open([gappy]);
  assert.equal(buildPlan(s).updatedSets.length, 0);
  assert.equal(hasChanges(s), false);
  // Once the list changes shape, everything is renumbered so a new set cannot
  // land on a position that is already taken.
  s = addSet(s, 'we-row', 'n1');
  const plan = buildPlan(s);
  assert.deepEqual(plan.updatedSets, [
    { id: 'r2', position: 1 },
    { id: 'r3', position: 2 },
  ]);
  assert.equal(plan.addedSets[0].position, 3);
});

// --- WAS label ---------------------------------------------------------------

test('WAS is empty until a set changes, then names the saved value without a unit', () => {
  let s = open();
  assert.equal(wasLabel(s, 'we-incline', 's3'), '');
  s = editSetReps(s, 'we-incline', 's3', '8');
  assert.equal(wasLabel(s, 'we-incline', 's3'), 'was 60 × 6');
  s = editSetWeight(s, 'we-incline', 's4', '65');
  assert.equal(wasLabel(s, 'we-incline', 's4'), 'was 68 × 5');
});

test('typing a value back to what was saved clears WAS and the change', () => {
  let s = open();
  s = editSetReps(s, 'we-incline', 's3', '8');
  s = editSetReps(s, 'we-incline', 's3', '6');
  assert.equal(wasLabel(s, 'we-incline', 's3'), '');
  assert.equal(hasChanges(s), false);
});

test('an added set reads "new"', () => {
  const s = addSet(open(), 'we-incline', 'n1');
  assert.equal(wasLabel(s, 'we-incline', 'n1'), 'new');
});

test('WAS for a bodyweight set shows BW or the added load', () => {
  let s = open();
  s = editSetReps(s, 'we-pullup', 'p1', '12');
  s = editSetReps(s, 'we-pullup', 'p2', '9');
  assert.equal(wasLabel(s, 'we-pullup', 'p1'), 'was BW × 11');
  assert.equal(wasLabel(s, 'we-pullup', 'p2'), 'was +10 × 8');
});

test('WAS is in the user unit', () => {
  let s = openEditSession(workout([oEx('bench', [oSet('b1', 102.0583, 5)])]), 'lb');
  s = editSetReps(s, 'we-bench', 'b1', '6');
  assert.equal(wasLabel(s, 'we-bench', 'b1'), 'was 225 × 5');
});

test('a set whose only change is its type says what it was', () => {
  const s = cycleSetType(open(), 'we-incline', 's2');
  assert.equal(s.exercises[0].sets[1].type, 'warmup');
  assert.equal(wasLabel(s, 'we-incline', 's2'), 'was normal');
  assert.equal(hasChanges(s), true);
});

// --- unticked sets -----------------------------------------------------------

test('a set left unticked stays unticked unless it is touched', () => {
  const ex = oEx('row', [oSet('r1', 30, 10), oSet('r2', 30, 9, 'normal', { done: false })]);
  let s = open([ex]);
  assert.equal(wasLabel(s, 'we-row', 'r2'), 'not done');
  assert.equal(hasChanges(s), false);

  s = markSetDone(s, 'we-row', 'r2');
  assert.equal(wasLabel(s, 'we-row', 'r2'), 'was not done');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r2', done: true }]);
});

test('typing into an unticked set logs it', () => {
  const ex = oEx('row', [oSet('r1', 30, 10, 'normal', { done: false })]);
  const s = editSetReps(open([ex]), 'we-row', 'r1', '12');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r1', reps: 12, done: true }]);
});

// --- untouched values keep their kilograms ----------------------------------

test('an untouched weight is never re-converted', () => {
  // 100 kg shows as 220.46 lb; converting that text back gives 99.9989 kg.
  const ex = oEx('squat', [oSet('q1', 100, 5), oSet('q2', 100, 5)]);
  let s = openEditSession(workout([ex]), 'lb');
  assert.equal(s.exercises[0].sets[0].weight, '220.46');
  s = editSetReps(s, 'we-squat', 'q1', '6');
  const plan = buildPlan(s);
  // Only reps moved: the weight column is not written at all.
  assert.deepEqual(plan.updatedSets, [{ id: 'q1', reps: 6 }]);
});

test('retyping the same displayed weight keeps the stored kilograms', () => {
  const ex = oEx('squat', [oSet('q1', 100, 5)]);
  let s = openEditSession(workout([ex]), 'lb');
  s = editSetWeight(s, 'we-squat', 'q1', '220.460');
  assert.equal(hasChanges(s), false);
  s = editSetWeight(s, 'we-squat', 'q1', '220,46');
  assert.equal(hasChanges(s), false);
});

test('a typed weight is converted to kilograms on the way out', () => {
  const ex = oEx('squat', [oSet('q1', 100, 5)]);
  const s = editSetWeight(openEditSession(workout([ex]), 'lb'), 'we-squat', 'q1', '225');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'q1', weight: 102.0583 }]);
});

test('clearing a weight stores null', () => {
  const s = editSetWeight(open(), 'we-incline', 's2', '');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 's2', weight: null }]);
});

// --- sets: add, remove -------------------------------------------------------

test('an added set carries the values above it, like a live workout', () => {
  const s = addSet(open(), 'we-incline', 'n1');
  const plan = buildPlan(s);
  assert.deepEqual(plan.addedSets, [
    { id: 'n1', workoutExerciseId: 'we-incline', position: 4, type: 'normal', weight: 68, reps: 5, done: true },
  ]);
  assert.equal(plan.changeCount, 1);
});

test('an added set with nothing to log is not saved and is not a change', () => {
  const ex = oEx('row', []);
  const s = addSet(open([ex, incline()]), 'we-row', 'n1');
  assert.deepEqual(buildPlan(s).addedSets, []);
  assert.equal(hasChanges(s), false);
});

test('removing a set renumbers the ones after it', () => {
  const s = removeSet(open(), 'we-incline', 's2');
  const plan = buildPlan(s);
  assert.deepEqual(plan.removedSetIds, ['s2']);
  assert.deepEqual(plan.updatedSets, [
    { id: 's3', position: 1 },
    { id: 's4', position: 2 },
  ]);
  assert.equal(plan.changeCount, 1);
  assert.deepEqual(plan.touchedExerciseIds, ['incline']);
});

test('removing an added set leaves no trace', () => {
  const s = removeSet(addSet(open(), 'we-incline', 'n1'), 'we-incline', 'n1');
  assert.equal(hasChanges(s), false);
});

// --- exercises ---------------------------------------------------------------

test('a removed exercise stays in the session until save, and can be undone', () => {
  let s = removeExercise(open(), 'we-pullup');
  assert.deepEqual(activeExercises(s).map((e) => e.id), ['we-incline']);
  assert.deepEqual(s.exercises.filter((e) => e.removed).map((e) => e.name), ['pullup']);
  const plan = buildPlan(s);
  assert.deepEqual(plan.removedExerciseIds, ['we-pullup']);
  assert.deepEqual(plan.touchedExerciseIds, ['pullup']);
  assert.equal(plan.changeCount, 1);

  s = undoRemoveExercise(s, 'we-pullup');
  assert.equal(hasChanges(s), false);
});

test('an added exercise is saved with its sets at the end of the workout', () => {
  let s = addExercise(open(), chosen('bench'), 'we-new', 'n1');
  // Its one blank set has nothing to log yet.
  assert.equal(hasChanges(s), false);
  s = editSetWeight(s, 'we-new', 'n1', '80');
  s = editSetReps(s, 'we-new', 'n1', '5');
  const plan = buildPlan(s);
  assert.deepEqual(plan.addedExercises, [
    {
      id: 'we-new',
      exerciseId: 'bench',
      position: 2,
      restSeconds: 120,
      supersetGroup: null,
      sets: [{ id: 'n1', position: 0, type: 'normal', weight: 80, reps: 5, done: true }],
    },
  ]);
  assert.deepEqual(plan.touchedExerciseIds, ['bench']);
  assert.equal(plan.changeCount, 1);
});

test('removing an exercise that was only just added forgets it', () => {
  const s = removeExercise(addExercise(open(), chosen('bench'), 'we-new', 'n1'), 'we-new');
  assert.equal(s.exercises.some((e) => e.id === 'we-new'), false);
});

test('replacing an exercise keeps its slot and drops its sets', () => {
  let s = replaceExercise(open(), 'we-incline', chosen('bench'), 'n1');
  s = editSetWeight(s, 'we-incline', 'n1', '80');
  s = editSetReps(s, 'we-incline', 'n1', '5');
  const plan = buildPlan(s);
  assert.deepEqual(plan.updatedExercises, [{ id: 'we-incline', exerciseId: 'bench', clearNote: true }]);
  assert.deepEqual(plan.removedSetIds, ['s1', 's2', 's3', 's4']);
  assert.equal(plan.addedSets.length, 1);
  assert.deepEqual(plan.touchedExerciseIds.slice().sort(), ['bench', 'incline']);
});

test('reordering writes the new positions', () => {
  const s = reorderExercises(open(), ['we-pullup', 'we-incline']);
  const plan = buildPlan(s);
  assert.deepEqual(plan.updatedExercises, [
    { id: 'we-pullup', position: 0 },
    { id: 'we-incline', position: 1 },
  ]);
  assert.equal(plan.changeCount, 1);
  // Order alone moves no record.
  assert.deepEqual(plan.touchedExerciseIds, []);
});

test('supersets: joining groups the exercises, leaving a pair dissolves it', () => {
  let s = joinSuperset(open(), ['we-incline', 'we-pullup']);
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [1, 1]);
  assert.deepEqual(buildPlan(s).updatedExercises, [
    { id: 'we-incline', supersetGroup: 1 },
    { id: 'we-pullup', supersetGroup: 1 },
  ]);
  s = leaveSuperset(s, 'we-pullup');
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [null, null]);
  assert.equal(hasChanges(s), false);
});

test('removing one of a pair dissolves the superset on screen and on save', () => {
  const grouped = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 3 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 3 }),
  ];
  const s = removeExercise(open(grouped), 'we-b');
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [null]);
  assert.deepEqual(buildPlan(s).updatedExercises, [{ id: 'we-a', supersetGroup: null }]);
});

// --- empty -------------------------------------------------------------------

test('a workout with no sets left cannot be saved', () => {
  let s = removeExercise(open(), 'we-pullup');
  s = removeExercise(s, 'we-incline');
  assert.equal(hasChanges(s), true);
  assert.equal(canSave(s), false);
  assert.equal(buildPlan(s).setCount, 0);
});

test('removing every set, exercise by exercise, also blocks saving', () => {
  let s = open([oEx('row', [oSet('r1', 30, 10)])]);
  s = removeSet(s, 'we-row', 'r1');
  assert.equal(canSave(s), false);
});

// --- date and duration -------------------------------------------------------

test('changing only the duration leaves the start alone', () => {
  const s = setWhen(open(), { startedAt: START, durationSeconds: 6120 });
  const plan = buildPlan(s);
  assert.equal(plan.startedAt, null);
  assert.equal(plan.durationSeconds, 6120);
  assert.equal(plan.endedAt, START + 6_120_000);
  assert.equal(plan.changeCount, 1);
  // A shorter session moves no record.
  assert.deepEqual(plan.touchedExerciseIds, []);
});

test('changing the date moves the end with it and touches every exercise', () => {
  const moved = START - 86_400_000;
  const s = setWhen(open(), { startedAt: moved, durationSeconds: 34_873 });
  const plan = buildPlan(s);
  assert.equal(plan.startedAt, moved);
  assert.equal(plan.durationSeconds, null);
  assert.equal(plan.endedAt, moved + 34_873_000);
  assert.deepEqual(plan.touchedExerciseIds.slice().sort(), ['incline', 'pullup']);
});

test('imports: set edits never touch the (name, started_at) pair', () => {
  let s = editSetReps(open(), 'we-incline', 's3', '8');
  s = removeExercise(s, 'we-pullup');
  s = setWhen(s, { startedAt: START, durationSeconds: 6120 });
  const plan = buildPlan(s);
  assert.equal(plan.startedAt, null);
  assert.equal('name' in plan, false);
});

test('duration parts round-trip, and an untouched wheel keeps the stored seconds', () => {
  assert.deepEqual(durationParts(34_873), { hours: 9, minutes: 41 });
  assert.equal(durationFromParts(9, 41, 34_873), 34_873);
  assert.equal(durationFromParts(1, 42, 34_873), 6120);
});

test('a start cannot be in the future', () => {
  const tomorrow = NOW + 86_400_000;
  const w = clampWhen({ startedAt: tomorrow, durationSeconds: 3600 }, NOW);
  assert.ok(w.startedAt <= NOW);
});

test('a workout cannot end in the future either', () => {
  const start = NOW - 30 * 60_000;
  const w = clampWhen({ startedAt: start, durationSeconds: 2 * 3600 }, NOW);
  assert.equal(w.startedAt, start);
  assert.equal(w.durationSeconds, 30 * 60);
  assert.ok(endsAt(w.startedAt, w.durationSeconds) <= NOW);
});

test('a duration is at least a minute and under a day', () => {
  const old = NOW - 10 * 86_400_000;
  assert.equal(clampWhen({ startedAt: old, durationSeconds: 0 }, NOW).durationSeconds, 60);
  assert.equal(clampWhen({ startedAt: old, durationSeconds: 99 * 3600 }, NOW).durationSeconds, 23 * 3600 + 59 * 60);
});

test('a valid past date and duration pass through unchanged', () => {
  const w = { startedAt: START, durationSeconds: 6120 };
  assert.deepEqual(clampWhen(w, NOW), w);
});

test('date parts: an impossible day falls back to the month end', () => {
  const p = startParts(new Date(2026, 0, 31, 7, 12).getTime());
  assert.deepEqual(p, { year: 2026, month: 0, day: 31, hour: 7, minute: 12 });
  const feb = new Date(startFromParts({ ...p, month: 1 }));
  assert.equal(feb.getMonth(), 1);
  assert.equal(feb.getDate(), 28);
  assert.equal(feb.getHours(), 7);
});

// --- records -----------------------------------------------------------------

const JUN23 = new Date(2026, 5, 23, 10, 0).getTime();

const history = (): Record<string, PRSession[]> => ({
  incline: [
    {
      id: 'old',
      achievedAt: JUN23,
      sets: [
        { id: 'h1', type: 'normal', weight: 66, reps: 5, done: true, kind: 'weighted' },
        { id: 'h2', type: 'normal', weight: 60, reps: 7, done: true, kind: 'weighted' },
      ],
    },
  ],
  pullup: [],
});

const ctx = () => ({ history: history(), bodyweightKg: 0, countWarmups: false });

test('no edit, no record change', () => {
  assert.deepEqual(recordImpact(open(), ctx()), []);
});

test('lowering the heaviest set loses the record and falls back to history', () => {
  const s = editSetWeight(open(), 'we-incline', 's4', '65');
  const changes = recordImpact(s, ctx());
  const best = changes.find((c) => c.metric === 'best_set');
  assert.ok(best);
  assert.equal(best.kind, 'lost');
  assert.equal(best.from?.display, '68 × 5');
  assert.equal(best.to?.display, '66 × 5');
  assert.equal(best.to?.achievedAt, JUN23);
  assert.equal(
    recordLine(changes.filter((c) => c.exerciseId === 'incline'), 'kg'),
    '68 × 5 was a record. Falls back to 66 × 5 · 23 Jun',
  );
  assert.deepEqual(recordRow(best, 'kg'), {
    metric: 'HEAVIEST WEIGHT',
    from: '68 × 5',
    to: '66 × 5',
    note: 'From 23 Jun',
    gained: false,
  });
});

test('fixing reps upward can gain a record', () => {
  const only = oEx('incline', [oSet('s2', 60, 8), oSet('s3', 60, 6)]);
  const s = editSetReps(open([only]), 'we-incline', 's3', '9');
  const changes = recordImpact(s, ctx());
  const reps = changes.find((c) => c.metric === 'max_reps');
  assert.ok(reps);
  assert.equal(reps.kind, 'gained');
  assert.deepEqual(recordRow(reps, 'kg'), {
    metric: 'MOST REPS',
    from: '8',
    to: '9',
    note: 'New record',
    gained: true,
  });
});

test('a record with nothing behind it is simply gone', () => {
  const s = removeExercise(open(), 'we-pullup');
  const changes = recordImpact(s, ctx());
  const reps = changes.find((c) => c.exerciseId === 'pullup' && c.metric === 'max_reps');
  assert.ok(reps);
  assert.equal(reps.kind, 'lost');
  assert.equal(reps.to, null);
  assert.equal(recordRow(reps, 'kg').to, '—');
  assert.equal(recordRow(reps, 'kg').note, 'No earlier record');
});

test('turning the record set into a warm-up withdraws it', () => {
  let s = open();
  // normal -> warmup
  s = cycleSetType(s, 'we-incline', 's4');
  const best = recordImpact(s, ctx()).find((c) => c.metric === 'best_set');
  assert.equal(best?.kind, 'lost');
  assert.equal(best?.to?.display, '66 × 5');
});

test('an exercise whose history has not loaded reports nothing', () => {
  const s = editSetWeight(open(), 'we-incline', 's4', '65');
  assert.deepEqual(recordImpact(s, { history: {}, bodyweightKg: 0, countWarmups: false }), []);
});

test('records read in the user unit', () => {
  const ex = oEx('incline', [oSet('s4', 68, 5)]);
  const s = editSetWeight(openEditSession(workout([ex]), 'lb'), 'we-incline', 's4', '140');
  const best = recordImpact(s, ctx()).find((c) => c.metric === 'best_set');
  assert.ok(best);
  assert.equal(recordRow(best, 'lb').from, '149.91 × 5');
});
