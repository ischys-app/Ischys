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
  canToggleDone,
  clampWhen,
  clampWhileTurning,
  collapseEffect,
  cycleSetType,
  durationFromParts,
  durationParts,
  editSetReps,
  editSetWeight,
  endsAt,
  exerciseHint,
  exerciseRows,
  hasChanges,
  joinSuperset,
  leaveSuperset,
  openEditSession,
  recordImpact,
  recordLine,
  recordRow,
  recordsPending,
  removeExercise,
  removeSet,
  reorderExercises,
  replaceExercise,
  setWhen,
  startFromParts,
  startParts,
  toggleSetDone,
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

  s = toggleSetDone(s, 'we-row', 'r2');
  assert.equal(wasLabel(s, 'we-row', 'r2'), 'now done');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r2', done: true }]);
});

test('typing into an unticked set changes the number, not whether it counts', () => {
  const ex = oEx('row', [oSet('r1', 30, 10, 'normal', { done: false })]);
  let s = editSetReps(open([ex]), 'we-row', 'r1', '12');
  assert.equal(s.exercises[0].sets[0].done, false);
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r1', reps: 12 }]);
  s = editSetWeight(s, 'we-row', 'r1', '32.5');
  assert.equal(s.exercises[0].sets[0].done, false);
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r1', weight: 32.5, reps: 12 }]);
  // Still an unticked set, and still says so.
  assert.equal(wasLabel(s, 'we-row', 'r1'), 'not done');
});

test('logging an unticked set can be taken back, and everything restored is no change', () => {
  const ex = oEx('row', [oSet('r1', 30, 10), oSet('r2', 30, 9, 'normal', { done: false })]);
  let s = open([ex]);
  assert.equal(canToggleDone(s, 'r2'), true);
  // A set stored as done has no such switch.
  assert.equal(canToggleDone(s, 'r1'), false);
  assert.equal(toggleSetDone(s, 'we-row', 'r1'), s);

  s = toggleSetDone(s, 'we-row', 'r2');
  assert.equal(hasChanges(s), true);
  s = toggleSetDone(s, 'we-row', 'r2');
  assert.equal(wasLabel(s, 'we-row', 'r2'), 'not done');
  assert.equal(hasChanges(s), false);

  // Typed, logged, then all of it put back.
  s = editSetReps(s, 'we-row', 'r2', '12');
  s = toggleSetDone(s, 'we-row', 'r2');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'r2', reps: 12, done: true }]);
  s = toggleSetDone(s, 'we-row', 'r2');
  s = editSetReps(s, 'we-row', 'r2', '9');
  assert.equal(hasChanges(s), false);
  assert.deepEqual(buildPlan(s).updatedSets, []);
});

test('every label the WAS cell can show for a set that is not a value fits it', () => {
  // 76pt at 390pt holds about nine characters of 11.5px mono after "was ".
  const ex = oEx('row', [oSet('r1', 30, 9, 'normal', { done: false })]);
  let s = open([ex, incline()]);
  const labels = [wasLabel(s, 'we-row', 'r1')];
  s = toggleSetDone(s, 'we-row', 'r1');
  labels.push(wasLabel(s, 'we-row', 'r1'));
  s = editSetWeight(addSet(open([oEx('row', [])]), 'we-row', 'n1'), 'we-row', 'n1', '40');
  labels.push(wasLabel(s, 'we-row', 'n1'));
  assert.deepEqual(labels, ['not done', 'now done', 'needs reps']);
  for (const l of labels) assert.ok(l.length <= 10, l);
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

test('an added set holds the values above it as real values, not placeholders', () => {
  let s = addSet(open(), 'we-incline', 'n1');
  const added = s.exercises[0].sets[4];
  assert.equal(added.weight, '68');
  assert.equal(added.reps, '5');
  assert.equal(hasChanges(s), true);
  // What is saved is what the row shows: clear a field and it is cleared.
  s = editSetWeight(s, 'we-incline', 'n1', '');
  assert.equal(buildPlan(s).addedSets[0].weight, null);
  // And with the reps cleared too it is a blank row again, and ignored.
  s = editSetReps(s, 'we-incline', 'n1', '');
  assert.deepEqual(buildPlan(s).addedSets, []);
  assert.equal(hasChanges(s), false);
});

test('an added set copies the nearest filled value above, column by column', () => {
  const ex = oEx('row', [oSet('r1', 40, 10), oSet('r2', null, 8), oSet('r3', 45, null)]);
  const s = addSet(open([ex]), 'we-row', 'n1');
  assert.deepEqual(buildPlan(s).addedSets, [
    { id: 'n1', workoutExerciseId: 'we-row', position: 3, type: 'normal', weight: 45, reps: 8, done: true },
  ]);
});

test('an added set under a stored weight is saved as the same kilograms', () => {
  // 100 kg shows as 220.46 lb; that text converted again would be 99.9989 kg.
  const ex = oEx('squat', [oSet('q1', 100, 5)]);
  let s = addSet(openEditSession(workout([ex]), 'lb'), 'we-squat', 'n1');
  assert.equal(s.exercises[0].sets[1].weight, '220.46');
  assert.equal(buildPlan(s).addedSets[0].weight, 100);
  // A second copy, of the copy, is still the stored value.
  s = addSet(s, 'we-squat', 'n2');
  assert.equal(buildPlan(s).addedSets[1].weight, 100);
  // Typed over, it is whatever was typed.
  s = editSetWeight(s, 'we-squat', 'n1', '225');
  assert.equal(buildPlan(s).addedSets[0].weight, 102.0583);
});

test('an added bodyweight set copies the reps and reads BW', () => {
  const s = addSet(open(), 'we-pullup', 'n1');
  assert.equal(s.exercises[1].sets[2].weight, '');
  assert.deepEqual(buildPlan(s).addedSets, [
    { id: 'n1', workoutExerciseId: 'we-pullup', position: 2, type: 'normal', weight: null, reps: 8, done: true },
  ]);
});

// --- sets that cannot be saved as they stand ----------------------------------

test('a half-typed added set holds Save back and says what it needs', () => {
  let s = addSet(open(), 'we-incline', 'n1');
  assert.equal(buildPlan(s).blocked, false);
  // The weight stays, the reps go.
  s = editSetReps(s, 'we-incline', 'n1', '');
  assert.equal(wasLabel(s, 'we-incline', 'n1'), 'needs reps');
  assert.equal(buildPlan(s).blocked, true);
  assert.equal(canSave(s), false);
  // Not saved, not dropped behind the user's back — and still a thing to discard.
  assert.deepEqual(buildPlan(s).addedSets, []);
  assert.equal(hasChanges(s), true);

  s = editSetReps(s, 'we-incline', 'n1', '6');
  assert.equal(wasLabel(s, 'we-incline', 'n1'), 'new');
  assert.equal(buildPlan(s).blocked, false);
  assert.equal(canSave(s), true);
});

test('a half-typed set in an added exercise holds Save back too', () => {
  let s = editSetReps(open(), 'we-incline', 's3', '8');
  s = addExercise(s, chosen('bench'), 'we-new', 'n1');
  // A blank added exercise is simply not saved.
  assert.equal(canSave(s), true);
  assert.equal(wasLabel(s, 'we-new', 'n1'), 'new');
  s = editSetWeight(s, 'we-new', 'n1', '80');
  assert.equal(canSave(s), false);
  assert.equal(wasLabel(s, 'we-new', 'n1'), 'needs reps');
  s = editSetWeight(s, 'we-new', 'n1', '');
  assert.equal(canSave(s), true);
});

test('a completely blank added row under saved sets is ignored', () => {
  let s = addSet(open(), 'we-incline', 'n1');
  s = editSetWeight(s, 'we-incline', 'n1', '');
  s = editSetReps(s, 'we-incline', 'n1', '');
  s = editSetReps(s, 'we-incline', 's3', '8');
  assert.equal(wasLabel(s, 'we-incline', 'n1'), 'new');
  assert.equal(buildPlan(s).blocked, false);
  assert.equal(canSave(s), true);
  assert.deepEqual(buildPlan(s).addedSets, []);
});

test('an exercise is never saved with no sets: replaced and left blank', () => {
  let s = replaceExercise(open(), 'we-incline', chosen('bench'), 'n1');
  // The pull-ups still hold sets, so the workout is not empty — the card is.
  assert.equal(buildPlan(s).setCount, 2);
  assert.equal(buildPlan(s).blocked, true);
  assert.equal(canSave(s), false);
  assert.equal(wasLabel(s, 'we-incline', 'n1'), 'needs reps');
  assert.equal(exerciseHint(s, 'we-incline'), null);

  s = editSetReps(s, 'we-incline', 'n1', '5');
  assert.equal(buildPlan(s).blocked, false);
  assert.equal(canSave(s), true);
});

test('an exercise is never saved with no sets: every set removed', () => {
  let s = open();
  for (const id of ['p1', 'p2']) s = removeSet(s, 'we-pullup', id);
  assert.equal(buildPlan(s).setCount, 4);
  assert.equal(canSave(s), false);
  assert.equal(exerciseHint(s, 'we-pullup'), 'Add a set, or remove this exercise.');
  assert.equal(exerciseHint(s, 'we-incline'), null);
  // Removing the exercise is the other way out.
  assert.equal(canSave(removeExercise(s, 'we-pullup')), true);
});

test('an exercise that was already stored empty does not hold other edits back', () => {
  let s = open([oEx('row', []), incline()]);
  s = editSetReps(s, 'we-incline', 's3', '8');
  assert.equal(buildPlan(s).blocked, false);
  assert.equal(canSave(s), true);
  assert.equal(exerciseHint(s, 'we-row'), null);
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

test('leaving a stored superset and joining it again is not a change', () => {
  const grouped = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 3 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 3 }),
    oEx('c', [oSet('c1', 10, 5)]),
  ];
  let s = leaveSuperset(open(grouped), 'we-b');
  assert.equal(hasChanges(s), true);
  s = joinSuperset(s, ['we-b', 'we-a']);
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [3, 3, null]);
  assert.equal(hasChanges(s), false);

  // A different membership is a new group, and a change.
  s = joinSuperset(leaveSuperset(open(grouped), 'we-b'), ['we-b', 'we-c']);
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [null, 4, 4]);
  assert.equal(hasChanges(s), true);
  // As is the stored pair with a third member.
  s = joinSuperset(open(grouped), ['we-c', 'we-a', 'we-b']);
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [4, 4, 4]);
});

test('a superset whose other half is not saved is saved as no superset', () => {
  let s = addExercise(open(), chosen('bench'), 'we-new', 'n1');
  s = joinSuperset(s, ['we-incline', 'we-new']);
  // On screen it is a pair. The blank addition is not saved, so nothing is.
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [1, null, 1]);
  let plan = buildPlan(s);
  assert.deepEqual(plan.addedExercises, []);
  assert.deepEqual(plan.updatedExercises, []);
  assert.equal(plan.changeCount, 0);

  // Once the addition holds a set, the pair is saved as one.
  s = editSetReps(s, 'we-new', 'n1', '5');
  plan = buildPlan(s);
  assert.equal(plan.addedExercises[0].supersetGroup, 1);
  assert.deepEqual(
    plan.updatedExercises.filter((p) => p.id === 'we-incline'),
    [{ id: 'we-incline', supersetGroup: 1 }],
  );
});

// 13b keeps the rail and tags on screen until Save (`exerciseRows`, below);
// what is saved is unchanged.
test('removing one of a pair dissolves the superset on save', () => {
  const grouped = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 3 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 3 }),
  ];
  const s = removeExercise(open(grouped), 'we-b');
  assert.deepEqual(activeExercises(s).map((e) => e.supersetGroup), [null]);
  assert.deepEqual(buildPlan(s).updatedExercises, [{ id: 'we-a', supersetGroup: null }]);
});

// --- removed exercises, in place (13b) ---------------------------------------

const three = () => [
  oEx('a', [oSet('a1', 10, 5), oSet('a2', 10, 5)]),
  oEx('b', [oSet('b1', 20, 5), oSet('b2', 20, 5), oSet('b3', 20, 5), oSet('b4', 20, 5)]),
  oEx('c', [oSet('c1', 30, 5)]),
];

const rowIds = (s: ReturnType<typeof open>) => exerciseRows(s).map((r) => r.exercise.id);

test('a removed exercise becomes a row where its card was', () => {
  const s = removeExercise(open(three()), 'we-b');
  const rows = exerciseRows(s);
  assert.deepEqual(rowIds(s), ['we-a', 'we-b', 'we-c']);
  assert.deepEqual(rows.map((r) => r.removed), [false, true, false]);
  assert.deepEqual(rows.map((r) => r.removedLabel), [null, 'REMOVED · 4 SETS', null]);
});

test('several removed exercises each keep their own place', () => {
  let s = removeExercise(open(three()), 'we-a');
  s = removeExercise(s, 'we-c');
  assert.deepEqual(rowIds(s), ['we-a', 'we-b', 'we-c']);
  assert.deepEqual(exerciseRows(s).map((r) => r.removed), [true, false, true]);
  assert.deepEqual(buildPlan(s).removedExerciseIds, ['we-a', 'we-c']);
});

test('the removed row says how many sets Save takes out of the workout', () => {
  // One set: singular.
  let s = removeExercise(open(three()), 'we-c');
  assert.equal(exerciseRows(s)[2].removedLabel, 'REMOVED · 1 SET');
  // Rows removed or added on the card first do not change what was stored.
  s = removeSet(open(three()), 'we-b', 'b4');
  s = addSet(s, 'we-a', 'n1');
  s = removeExercise(removeExercise(s, 'we-b'), 'we-a');
  assert.deepEqual(
    exerciseRows(s).map((r) => r.removedLabel),
    ['REMOVED · 2 SETS', 'REMOVED · 4 SETS', null],
  );
});

test('undo brings the card back with the set edits made before it was removed', () => {
  let s = editSetReps(open(three()), 'we-b', 'b2', '9');
  s = removeSet(s, 'we-b', 'b4');
  s = removeExercise(s, 'we-b');
  // While removed, those edits are not part of the plan: the exercise just goes.
  assert.equal(buildPlan(s).changeCount, 1);
  assert.deepEqual(buildPlan(s).updatedSets, []);

  s = undoRemoveExercise(s, 'we-b');
  const row = exerciseRows(s)[1];
  assert.equal(row.removed, false);
  assert.deepEqual(row.exercise.sets.map((x) => x.reps), ['5', '9', '5']);
  assert.equal(wasLabel(s, 'we-b', 'b2'), 'was 20 × 5');
  const plan = buildPlan(s);
  assert.deepEqual(plan.removedExerciseIds, []);
  assert.deepEqual(plan.removedSetIds, ['b4']);
  assert.deepEqual(plan.updatedSets, [{ id: 'b2', reps: 9 }]);
});

test('removing a stored exercise leaves a row, and every superset label where it was', () => {
  assert.deepEqual(collapseEffect(open(three()), 'we-b'), { leavesRow: true, headersLost: 0 });
  // One of a pair: the removed partner holds the group, and its label, open.
  const pair = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 3 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 3 }),
  ];
  assert.deepEqual(collapseEffect(open(pair), 'we-a'), { leavesRow: true, headersLost: 0 });
  assert.deepEqual(collapseEffect(open(pair), 'we-b'), { leavesRow: true, headersLost: 0 });
});

test('removing an exercise added in this edit takes its whole place out of the list', () => {
  const s = addExercise(open(three()), chosen('bench'), 'we-new', 'n1');
  assert.deepEqual(collapseEffect(s, 'we-new'), { leavesRow: false, headersLost: 0 });
});

test('an added exercise that vanishes takes a superset label with it when it ends the pair', () => {
  // Paired with a stored exercise: without it there is no group, so no label.
  let s = addExercise(open(three()), chosen('bench'), 'we-new', 'n1');
  s = joinSuperset(s, ['we-c', 'we-new']);
  assert.equal(exerciseRows(s).filter((r) => r.header).length, 1);
  assert.deepEqual(collapseEffect(s, 'we-new'), { leavesRow: false, headersLost: 1 });

  // One of three: the other two are still a superset, and still labelled.
  s = joinSuperset(addExercise(open(three()), chosen('bench'), 'we-new', 'n1'), [
    'we-b',
    'we-c',
    'we-new',
  ]);
  assert.deepEqual(collapseEffect(s, 'we-new'), { leavesRow: false, headersLost: 0 });

  // First of its group, so the label was over it: the next partner inherits it.
  s = addExercise(open(three()), chosen('bench'), 'we-n1', 'n1');
  s = addExercise(s, chosen('row'), 'we-n2', 'n2');
  s = addExercise(s, chosen('curl'), 'we-n3', 'n3');
  s = joinSuperset(s, ['we-n1', 'we-n2', 'we-n3']);
  assert.equal(exerciseRows(s).find((r) => r.header)?.exercise.id, 'we-n1');
  assert.deepEqual(collapseEffect(s, 'we-n1'), { leavesRow: false, headersLost: 0 });
});

test('an added exercise goes under everything, removed rows included', () => {
  let s = removeExercise(open(three()), 'we-c');
  s = addExercise(s, chosen('bench'), 'we-new', 'n1');
  assert.deepEqual(rowIds(s), ['we-a', 'we-b', 'we-c', 'we-new']);
  s = editSetReps(s, 'we-new', 'n1', '5');
  // Saved positions count only what is saved.
  assert.equal(buildPlan(s).addedExercises[0].position, 2);
});

test('reordering the cards leaves a removed row where it is', () => {
  let s = removeExercise(open(three()), 'we-b');
  s = reorderExercises(s, ['we-c', 'we-a']);
  assert.deepEqual(rowIds(s), ['we-c', 'we-b', 'we-a']);
  assert.deepEqual(exerciseRows(s).map((r) => r.removed), [false, true, false]);
  assert.deepEqual(buildPlan(s).updatedExercises, [
    { id: 'we-c', position: 0 },
    { id: 'we-a', position: 1 },
  ]);
  // Undo, and it is back between them.
  s = undoRemoveExercise(s, 'we-b');
  assert.deepEqual(activeExercises(s).map((e) => e.id), ['we-c', 'we-b', 'we-a']);
});

const pair = () => [
  oEx('a', [oSet('a1', 10, 5), oSet('a2', 10, 5), oSet('a3', 10, 5)], { supersetGroup: 3 }),
  oEx('b', [oSet('b1', 10, 5), oSet('b2', 10, 5), oSet('b3', 10, 5)], { supersetGroup: 3 }),
  oEx('c', [oSet('c1', 10, 5)]),
];

test('an untouched superset reads its letter, its tags and its rounds', () => {
  const rows = exerciseRows(open(pair()));
  assert.deepEqual(rows.map((r) => r.tag), ['A1', 'A2', null]);
  assert.deepEqual(rows.map((r) => r.header), [{ label: 'SUPERSET A', note: '· 3 ROUNDS' }, null, null]);
  assert.deepEqual(rows.map((r) => [r.railAbove, r.railBelow]), [
    [false, true],
    [true, false],
    [false, false],
  ]);
});

test('a removed superset partner stays in the rail with its tag, and the label says the group ends', () => {
  let s = removeExercise(open(pair()), 'we-b');
  let rows = exerciseRows(s);
  assert.deepEqual(rows.map((r) => r.tag), ['A1', 'A2', null]);
  assert.deepEqual(rows.map((r) => r.exercise.supersetGroup), [3, 3, null]);
  assert.deepEqual(rows[0].header, { label: 'SUPERSET A', note: '· ENDS WHEN SAVED' });
  assert.equal(rows[1].removed, true);
  assert.equal(rows[1].railAbove, true);
  // What is saved is the 11a rule: one exercise is not a superset.
  assert.deepEqual(buildPlan(s).updatedExercises, [
    { id: 'we-a', supersetGroup: null },
    { id: 'we-c', position: 1 },
  ]);

  // Undo brings the label back to normal.
  s = undoRemoveExercise(s, 'we-b');
  rows = exerciseRows(s);
  assert.deepEqual(rows[0].header, { label: 'SUPERSET A', note: '· 3 ROUNDS' });
  assert.equal(hasChanges(s), false);
});

test('when the first of a group is the one removed, the label sits over its row', () => {
  const rows = exerciseRows(removeExercise(open(pair()), 'we-a'));
  assert.deepEqual(rows[0].header, { label: 'SUPERSET A', note: '· ENDS WHEN SAVED' });
  assert.equal(rows[0].removed, true);
  assert.deepEqual(rows.map((r) => r.tag), ['A1', 'A2', null]);
});

test('a group of three with one removed says how many are left after save', () => {
  const trio = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 1 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 1 }),
    oEx('c', [oSet('c1', 10, 5)], { supersetGroup: 1 }),
  ];
  let s = removeExercise(open(trio), 'we-b');
  let rows = exerciseRows(s);
  assert.deepEqual(rows[0].header, { label: 'SUPERSET A', note: '· 2 AFTER SAVE' });
  // Tags do not close the gap until Save.
  assert.deepEqual(rows.map((r) => r.tag), ['A1', 'A2', 'A3']);
  // The two that are left are saved as the superset they still are.
  assert.deepEqual(buildPlan(s).updatedExercises, [{ id: 'we-c', position: 1 }]);

  s = removeExercise(s, 'we-c');
  rows = exerciseRows(s);
  assert.deepEqual(rows[0].header, { label: 'SUPERSET A', note: '· ENDS WHEN SAVED' });
});

test('groups keep their letters while an earlier group is removed', () => {
  const two = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 1 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 1 }),
    oEx('c', [oSet('c1', 10, 5)], { supersetGroup: 2 }),
    oEx('d', [oSet('d1', 10, 5)], { supersetGroup: 2 }),
  ];
  const s = removeExercise(removeExercise(open(two), 'we-a'), 'we-b');
  assert.deepEqual(exerciseRows(s).map((r) => r.tag), ['A1', 'A2', 'B1', 'B2']);
  assert.deepEqual(exerciseRows(s)[2].header, { label: 'SUPERSET B', note: '· 1 ROUND' });
});

test('the label counts only partners that will be saved', () => {
  const trio = [
    oEx('a', [oSet('a1', 10, 5)], { supersetGroup: 1 }),
    oEx('b', [oSet('b1', 10, 5)], { supersetGroup: 1 }),
    oEx('c', [oSet('c1', 10, 5)]),
  ];
  // A blank addition joins the pair, then a stored partner is removed: what is
  // left to save is one exercise, because the addition has no set.
  let s = addExercise(open(trio), chosen('bench'), 'we-new', 'n1');
  s = joinSuperset(s, ['we-a', 'we-b', 'we-new']);
  s = removeExercise(s, 'we-b');
  assert.equal(exerciseRows(s)[0].header?.note, '· ENDS WHEN SAVED');
  s = editSetReps(s, 'we-new', 'n1', '5');
  assert.equal(exerciseRows(s)[0].header?.note, '· 2 AFTER SAVE');
});

test('a card that leaves the group of a removed partner takes the rail with it', () => {
  let s = removeExercise(open(pair()), 'we-b');
  s = leaveSuperset(s, 'we-a');
  const rows = exerciseRows(s);
  assert.deepEqual(rows.map((r) => r.tag), [null, null, null]);
  assert.deepEqual(rows.map((r) => r.header), [null, null, null]);
  assert.deepEqual(rows.map((r) => r.exercise.supersetGroup), [null, null, null]);
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

test('a turning wheel holds the start back but never eats the duration', () => {
  // Noon. Scrolling the day to today passes through "today at 18:00".
  const sixPm = new Date(2026, 9, 5, 18, 0).getTime();
  const w = clampWhileTurning({ startedAt: sixPm, durationSeconds: 6120 }, NOW);
  assert.equal(w.startedAt, NOW);
  assert.equal(w.durationSeconds, 6120);
  // Confirming is where the end is checked.
  assert.equal(clampWhen(w, NOW).durationSeconds, 60);
});

test('a duration is at least a minute and under a day', () => {
  const old = NOW - 10 * 86_400_000;
  assert.equal(clampWhen({ startedAt: old, durationSeconds: 0 }, NOW).durationSeconds, 60);
  assert.equal(clampWhen({ startedAt: old, durationSeconds: 99 * 3600 }, NOW).durationSeconds, 23 * 3600 + 59 * 60);
});

test('a workout stored with no duration keeps none while only its date moves', () => {
  const start = NOW - 10 * 86_400_000;
  const earlier = start - 86_400_000;
  assert.deepEqual(clampWhileTurning({ startedAt: earlier, durationSeconds: 0 }, NOW, 0), {
    startedAt: earlier,
    durationSeconds: 0,
  });
  assert.deepEqual(clampWhen({ startedAt: earlier, durationSeconds: 0 }, NOW, 0), {
    startedAt: earlier,
    durationSeconds: 0,
  });
  // Changed, it is held to the wheel's range like any other.
  assert.equal(clampWhileTurning({ startedAt: earlier, durationSeconds: 30 }, NOW, 0).durationSeconds, 60);
  assert.equal(clampWhen({ startedAt: earlier, durationSeconds: 30 }, NOW, 0).durationSeconds, 60);
  // And so the session reports no change at all for the duration.
  const zero = openEditSession(workout([incline()], { startedAt: start, durationSeconds: 0, endedAt: start }), 'kg');
  const plan = buildPlan(setWhen(zero, clampWhen({ startedAt: earlier, durationSeconds: 0 }, NOW, 0)));
  assert.equal(plan.durationSeconds, null);
  assert.equal(plan.startedAt, earlier);
});

test('an over-long stored duration survives a date change but never ends in the future', () => {
  const thirtyHours = 30 * 3600;
  const old = NOW - 10 * 86_400_000;
  assert.equal(clampWhen({ startedAt: old, durationSeconds: thirtyHours }, NOW, thirtyHours).durationSeconds, thirtyHours);
  assert.equal(clampWhileTurning({ startedAt: old, durationSeconds: thirtyHours }, NOW, thirtyHours).durationSeconds, thirtyHours);
  const recent = NOW - 2 * 3600_000;
  assert.equal(clampWhen({ startedAt: recent, durationSeconds: thirtyHours }, NOW, thirtyHours).durationSeconds, 2 * 3600);
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

test('the preview is pending while an added or replacing exercise has no history loaded', () => {
  const base = ctx();
  assert.equal(recordsPending(open(), base), false);
  let s = addExercise(open(), chosen('bench'), 'we-new', 'n1');
  assert.equal(recordsPending(s, base), true);
  // Until then a record it would set is not reported, which is why Save waits.
  s = editSetWeight(s, 'we-new', 'n1', '80');
  s = editSetReps(s, 'we-new', 'n1', '5');
  assert.equal(recordImpact(s, base).some((c) => c.exerciseId === 'bench'), false);
  const loaded = { ...base, history: { ...base.history, bench: [] } };
  assert.equal(recordsPending(s, loaded), false);
  assert.equal(recordImpact(s, loaded).some((c) => c.exerciseId === 'bench' && c.kind === 'gained'), true);

  const replaced = replaceExercise(open(), 'we-incline', chosen('bench'), 'n1');
  assert.equal(recordsPending(replaced, base), true);
  assert.equal(recordsPending(replaced, loaded), false);
});

// --- bodyweight added load -----------------------------------------------------

test('a positive added load on a bodyweight exercise reads +10 and is still the stored value', () => {
  let s = open();
  assert.equal(s.exercises[1].sets[0].weight, '');
  assert.equal(s.exercises[1].sets[1].weight, '+10');
  // Weighted exercises are bare numbers, as ever.
  assert.equal(s.exercises[0].sets[1].weight, '60');
  assert.equal(hasChanges(s), false);
  assert.equal(wasLabel(s, 'we-pullup', 'p2'), '');

  // Untouched, the weight is not written at all.
  s = editSetReps(s, 'we-pullup', 'p2', '9');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'p2', reps: 9 }]);
  // Retyped without the sign — the keypad has none — it is the same load.
  s = editSetWeight(s, 'we-pullup', 'p2', '10');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'p2', reps: 9 }]);
  s = editSetWeight(s, 'we-pullup', 'p2', '+12.5');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'p2', weight: 12.5, reps: 9 }]);
});

test('+load keeps its stored kilograms in lb, and zero or negative loads take no sign', () => {
  const ex = oEx('dip', [oSet('d1', 10, 8), oSet('d2', 0, 8), oSet('d3', -20, 8)], { kind: 'bodyweight' });
  let s = openEditSession(workout([ex]), 'lb');
  assert.deepEqual(s.exercises[0].sets.map((x) => x.weight), ['+22.05', '0', '-44.09']);
  assert.equal(hasChanges(s), false);
  // 22.05 lb converted again would be 10.0017 kg.
  s = editSetReps(s, 'we-dip', 'd1', '9');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'd1', reps: 9 }]);
  s = editSetWeight(s, 'we-dip', 'd1', '+22.05');
  assert.deepEqual(buildPlan(s).updatedSets, [{ id: 'd1', reps: 9 }]);
});
