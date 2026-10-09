/** Run with: npm test — which workouts an import writes, and which exercises that touches. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exerciseKey, planImport, workoutKey, type ImportCandidate } from './importPlan.ts';
import { parseWorkoutCsv, toWorkoutCsv } from './workoutCsv.ts';

// Starts are given in minutes: a workout's identity is its name and the minute
// it began (see `workoutKey`), so two that differ are a minute apart or more.
const at = (minute: number): number => minute * 60_000;

const candidate = (
  name: string,
  minute: number | null,
  exerciseNames: string[],
): ImportCandidate<string> => ({
  workout: `${name}#${minute}`,
  key: minute === null ? null : workoutKey(name, at(minute)),
  exerciseNames,
});

test('a workout is the same one anywhere inside the minute it began', () => {
  // Stored to the millisecond; a CSV row only says the minute.
  const logged = at(1000) + 37_412;
  assert.equal(workoutKey('Push', logged), workoutKey('Push', at(1000)));
  assert.equal(workoutKey('Push', at(1000) + 59_999), workoutKey('Push', at(1000)));
  assert.notEqual(workoutKey('Push', at(1001)), workoutKey('Push', at(1000)));
  assert.notEqual(workoutKey('Pull', logged), workoutKey('Push', logged));
});

test('a workout logged here is skipped when its own exported row comes back', () => {
  const seen = new Set([workoutKey('Push', at(1000) + 37_412)]);
  const plan = planImport([candidate('Push', 1000, ['Bench Press'])], seen);
  assert.deepEqual(plan.accepted, []);
  assert.equal(plan.duplicatesSkipped, 1);
});

test('every workout of a first import is written', () => {
  const plan = planImport([candidate('Push', 1, ['Bench Press']), candidate('Pull', 2, ['Row'])], new Set());
  assert.deepEqual(plan.accepted, ['Push#1', 'Pull#2']);
  assert.equal(plan.duplicatesSkipped, 0);
});

test('a workout already in the database, by name and start, is skipped', () => {
  const seen = new Set([workoutKey('Push', at(1))]);
  const plan = planImport([candidate('Push', 1, ['Bench Press']), candidate('Push', 2, ['Row'])], seen);
  assert.deepEqual(plan.accepted, ['Push#2']);
  assert.equal(plan.duplicatesSkipped, 1);
});

test('a workout the same file lists twice is written once', () => {
  const plan = planImport([candidate('Push', 1, ['Bench Press']), candidate('Push', 1, ['Dip'])], new Set());
  assert.deepEqual(plan.accepted, ['Push#1']);
  assert.equal(plan.duplicatesSkipped, 1);
  // The second listing is not written, so its exercise is not touched.
  assert.deepEqual(plan.exercises, ['Bench Press']);
});

test('a workout with no start cannot be told from another and is always written', () => {
  const plan = planImport([candidate('Workout', null, ['Row']), candidate('Workout', null, ['Row'])], new Set());
  assert.equal(plan.accepted.length, 2);
  assert.equal(plan.duplicatesSkipped, 0);
});

test('the caller’s record of what is stored is left as it was', () => {
  const seen = new Set<string>();
  planImport([candidate('Push', 1, ['Bench Press'])], seen);
  assert.equal(seen.size, 0);
});

test('the touched exercises are those of the workouts written, each once', () => {
  const plan = planImport(
    [
      candidate('Push', 1, ['Bench Press', 'Dip', 'Bench Press']),
      candidate('Pull', 2, ['Row', 'Dip']),
    ],
    new Set(),
  );
  assert.deepEqual(plan.exercises, ['Bench Press', 'Dip', 'Row']);
});

test('an exercise only a skipped workout names is not touched', () => {
  const seen = new Set([workoutKey('Push', at(1))]);
  const plan = planImport(
    [candidate('Push', 1, ['Bench Press', 'Dip']), candidate('Pull', 2, ['Row', 'Dip'])],
    seen,
  );
  // Bench Press has no new session: its flags have nothing new to account for.
  assert.deepEqual(plan.exercises, ['Row', 'Dip']);
});

test('a name is one exercise whatever its case or padding, under its first spelling', () => {
  const plan = planImport(
    [candidate('Push', 1, ['  Bench Press ', 'bench press']), candidate('Push', 2, ['BENCH PRESS'])],
    new Set(),
  );
  assert.deepEqual(plan.exercises, ['Bench Press']);
  assert.equal(exerciseKey('  Bench Press '), exerciseKey('BENCH PRESS'));
});

test('an exercise with no name is not an exercise', () => {
  const plan = planImport([candidate('Push', 1, ['', '   ', 'Dip'])], new Set());
  assert.deepEqual(plan.exercises, ['Dip']);
});

test('an import of nothing new touches nothing', () => {
  const seen = new Set([workoutKey('Push', at(1))]);
  const plan = planImport([candidate('Push', 1, ['Bench Press'])], seen);
  assert.deepEqual(plan.accepted, []);
  assert.deepEqual(plan.exercises, []);
});

test('the exercises of a workout skipped as already stored are reported for repair', () => {
  const seen = new Set([workoutKey('Push', at(1)), workoutKey('Pull', at(2))]);
  const plan = planImport(
    [candidate('Push', 1, ['Bench Press', ' dip ']), candidate('Pull', 2, ['Row', 'DIP'])],
    seen,
  );
  // Nothing is written, as before…
  assert.deepEqual(plan.accepted, []);
  assert.deepEqual(plan.exercises, []);
  assert.equal(plan.duplicatesSkipped, 2);
  // …but importing the same file again names every exercise it holds, once.
  assert.deepEqual(plan.storedExercises, ['Bench Press', 'dip', 'Row']);
});

test('an exercise a written workout also names is touched once, not repaired as well', () => {
  const seen = new Set([workoutKey('Push', at(1))]);
  const plan = planImport(
    [candidate('Push', 1, ['Bench Press', 'Dip']), candidate('Pull', 2, ['Row', 'dip'])],
    seen,
  );
  assert.deepEqual(plan.exercises, ['Row', 'dip']);
  assert.deepEqual(plan.storedExercises, ['Bench Press']);
  // Whichever comes first in the file: here the written workout does.
  const reversed = planImport(
    [candidate('Pull', 2, ['Row', 'dip']), candidate('Push', 1, ['Bench Press', 'Dip'])],
    seen,
  );
  assert.deepEqual(reversed.exercises, ['Row', 'dip']);
  assert.deepEqual(reversed.storedExercises, ['Bench Press']);
});

test('a second listing inside the file is not stored history: its exercises are not repaired', () => {
  const plan = planImport([candidate('Push', 1, ['Bench Press']), candidate('Push', 1, ['Dip'])], new Set());
  assert.equal(plan.duplicatesSkipped, 1);
  assert.deepEqual(plan.storedExercises, []);
});

test('a first import has nothing stored to repair', () => {
  const plan = planImport([candidate('Push', 1, ['Bench Press']), candidate('Workout', null, ['Row'])], new Set());
  assert.deepEqual(plan.storedExercises, []);
});

test('the CSV export of a workout parses back to the same identity', () => {
  // Local wall-clock time, seconds and milliseconds included, as a workout
  // started by a tap is stored.
  const startedAt = new Date(2026, 6, 10, 9, 0, 37, 412).getTime();
  const csv = toWorkoutCsv([
    {
      name: 'Push',
      startedAt,
      endedAt: startedAt + 3_600_000,
      notes: null,
      exercises: [
        {
          name: 'Bench Press',
          note: null,
          supersetGroup: null,
          sets: [{ position: 0, type: 'normal', weight: 100, reps: 5, rpe: null }],
        },
      ],
    },
  ]);
  const [parsed] = parseWorkoutCsv(csv).workouts;
  assert.equal(workoutKey(parsed.title, parsed.startedAt as number), workoutKey('Push', startedAt));
});
