/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseCsv,
  parseWorkoutCsv,
  parseCsvTime,
  parseCsvDuration,
  summarizeWorkoutCsv,
  toWorkoutCsv,
  type ExportWorkout,
} from './workoutCsv.ts';

test('parseCsv handles quoted fields with commas', () => {
  const rows = parseCsv('a,b\n"x,y",z\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,y', 'z'],
  ]);
});

test('parseCsvTime parses the CSV timestamp', () => {
  const ms = parseCsvTime('10 Jul 2026, 09:05');
  assert.equal(ms, new Date(2026, 6, 10, 9, 5).getTime());
  assert.equal(parseCsvTime('garbage'), null);
});

test('export -> import round-trips a workout', () => {
  const workouts: ExportWorkout[] = [
    {
      name: 'Push',
      startedAt: new Date(2026, 6, 10, 9, 0).getTime(),
      endedAt: new Date(2026, 6, 10, 10, 0).getTime(),
      notes: null,
      exercises: [
        {
          name: 'Bench Press',
          note: null,
          supersetGroup: null,
          sets: [
            { position: 0, type: 'warmup', weight: 40, reps: 10 },
            { position: 1, type: 'normal', weight: 60, reps: 8 },
          ],
        },
      ],
    },
  ];
  const csv = toWorkoutCsv(workouts);
  const parsed = parseWorkoutCsv(csv);
  assert.equal(parsed.workouts.length, 1);
  const w = parsed.workouts[0];
  assert.equal(w.title, 'Push');
  assert.equal(w.startedAt, workouts[0].startedAt);
  assert.equal(w.exercises[0].title, 'Bench Press');
  assert.deepEqual(w.exercises[0].sets, [
    { type: 'warmup', weight: 40, reps: 10, rpe: null },
    { type: 'normal', weight: 60, reps: 8, rpe: null },
  ]);
});

const ratedWorkout = (sets: ExportWorkout['exercises'][number]['sets']): ExportWorkout[] => [
  {
    name: 'Push',
    startedAt: new Date(2026, 6, 10, 9, 0).getTime(),
    endedAt: new Date(2026, 6, 10, 10, 0).getTime(),
    notes: null,
    exercises: [{ name: 'Bench Press', note: null, supersetGroup: null, sets }],
  },
];

test('export -> import round-trips a set\'s effort rating', () => {
  const csv = toWorkoutCsv(
    ratedWorkout([
      { position: 0, type: 'normal', weight: 60, reps: 8, rpe: 8.5 },
      { position: 1, type: 'normal', weight: 60, reps: 8, rpe: 10 },
      { position: 2, type: 'normal', weight: 60, reps: 6, rpe: null },
      { position: 3, type: 'normal', weight: 60, reps: 6 },
    ]),
  );
  const lines = csv.trim().split('\n');
  assert.equal(lines[0].split(',').at(-1), 'rpe');
  assert.deepEqual(lines.slice(1).map((l) => l.split(',').at(-1)), ['8.5', '10', '', '']);
  assert.deepEqual(
    parseWorkoutCsv(csv).workouts[0].exercises[0].sets.map((s) => s.rpe),
    [8.5, 10, null, null],
  );
});

test('an export written before ratings were stored still imports', () => {
  // The column was always in the header; its cells were always empty.
  const old =
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe\n' +
    'Push,"10 Jul 2026, 09:00","10 Jul 2026, 10:00",,Bench Press,,,0,normal,60,8,,,\n';
  const parsed = parseWorkoutCsv(old);
  assert.equal(parsed.unmapped, false);
  assert.deepEqual(parsed.workouts[0].exercises[0].sets, [{ type: 'normal', weight: 60, reps: 8, rpe: null }]);
});

test('a CSV with no rpe column imports unrated', () => {
  const parsed = parseWorkoutCsv('exercise_title,weight_kg,reps\nSquat,100,5\n');
  assert.deepEqual(parsed.workouts[0].exercises[0].sets, [{ type: 'normal', weight: 100, reps: 5, rpe: null }]);
});

test('an imported rating is kept on the half-step grid, junk is dropped', () => {
  const parsed = parseWorkoutCsv('exercise_title,weight_kg,reps,RPE\nSquat,100,5,9\nSquat,100,5,7.5\nSquat,100,5,hard\nSquat,100,5,0\nSquat,100,5,4\n');
  assert.deepEqual(
    parsed.workouts[0].exercises[0].sets.map((s) => s.rpe),
    [9, 7.5, null, null, 4],
  );
});

test('rows missing title/exercise are skipped', () => {
  const csv = 'title,start_time,exercise_title,set_type,weight_kg,reps\n,,,normal,60,8\nPush,10 Jul 2026, 09:00,Bench,normal,60,8\n';
  const parsed = parseWorkoutCsv(csv);
  assert.ok(parsed.rowsSkipped >= 1);
});

test('a workout the file never named is marked untitled', () => {
  // The 'Workout' fallback keeps the sets, but must not become a routine name.
  const csv =
    'title,start_time,exercise_title,set_type,weight_kg,reps\n' +
    ',10 Jul 2026 09:00,Bench,normal,60,8\n' +
    'Push,11 Jul 2026 09:00,Bench,normal,60,8\n';
  const parsed = parseWorkoutCsv(csv);
  assert.deepEqual(
    parsed.workouts.map((w) => [w.title, w.titled]),
    [
      ['Workout', false],
      ['Push', true],
    ],
  );
});

// --- Third-party CSV schemas (issue #73) -------------------------------------
// A flat one-row-per-set CSV from another tracker: Title Case headers, an
// ISO-ish timestamp, and a unit-less `Weight` column. Before header aliasing
// every lookup missed, so all rows collapsed into one untitled workout in the
// preview and were skipped outright by the import.
const TITLECASE_CSV =
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,RPE\n' +
  '2024-07-26 14:11:23,Full Body B,24m,Deadlift (Barbell),1,135.0,8.0,0,0.0,\n' +
  '2024-07-26 14:11:23,Full Body B,24m,Deadlift (Barbell),2,135.0,7.0,0,0.0,\n' +
  '2024-07-26 14:11:23,Full Body B,24m,Lat Pulldown (Cable),1,50.0,10.0,0,0.0,\n' +
  '2024-07-27 07:25:16,Full Body A,39m,Squat (Barbell),1,225.0,8.0,0,0.0,\n';

test('parseCsvTime parses an ISO-ish timestamp', () => {
  assert.equal(parseCsvTime('2024-07-26 14:11:23'), new Date(2024, 6, 26, 14, 11, 23).getTime());
  assert.equal(parseCsvTime('2024-07-26T14:11:23'), new Date(2024, 6, 26, 14, 11, 23).getTime());
  assert.equal(parseCsvTime('2024-07-26 14:11'), new Date(2024, 6, 26, 14, 11).getTime());
});

test('parseWorkoutCsv groups Title Case headers by date into distinct workouts', () => {
  const parsed = parseWorkoutCsv(TITLECASE_CSV);
  assert.equal(parsed.rowsSkipped, 0);
  assert.equal(parsed.workouts.length, 2);
  const [first, second] = parsed.workouts;
  assert.equal(first.title, 'Full Body B');
  assert.equal(first.startedAt, new Date(2024, 6, 26, 14, 11, 23).getTime());
  assert.deepEqual(
    first.exercises.map((e) => e.title),
    ['Deadlift (Barbell)', 'Lat Pulldown (Cable)'],
  );
  assert.equal(first.exercises[0].sets.length, 2);
  assert.equal(second.title, 'Full Body A');
  assert.equal(second.exercises[0].title, 'Squat (Barbell)');
});

test('parseWorkoutCsv reports whether the file stated its weight unit', () => {
  assert.equal(parseWorkoutCsv(TITLECASE_CSV).weightUnitKnown, false);
  const ours = 'title,start_time,exercise_title,set_type,weight_kg,reps\nPush,"10 Jul 2026, 09:00",Bench,normal,60,8\n';
  assert.equal(parseWorkoutCsv(ours).weightUnitKnown, true);
});

test('parseWorkoutCsv converts a unit-less weight column when told it is lb', () => {
  const asLb = parseWorkoutCsv(TITLECASE_CSV, { weightUnit: 'lb' });
  // 135 lb -> 61.235 kg (toKg rounds to 4dp)
  assert.equal(asLb.workouts[0].exercises[0].sets[0].weight, 61.235);
  const asKg = parseWorkoutCsv(TITLECASE_CSV, { weightUnit: 'kg' });
  assert.equal(asKg.workouts[0].exercises[0].sets[0].weight, 135);
});

test('an explicit weight_kg column is never converted, whatever unit is passed', () => {
  const ours = 'title,start_time,exercise_title,set_type,weight_kg,reps\nPush,"10 Jul 2026, 09:00",Bench,normal,60,8\n';
  const parsed = parseWorkoutCsv(ours, { weightUnit: 'lb' });
  assert.equal(parsed.workouts[0].exercises[0].sets[0].weight, 60);
});

test('summarizeWorkoutCsv counts what the import will actually write', () => {
  const s = summarizeWorkoutCsv(TITLECASE_CSV);
  assert.equal(s.workouts, 2);
  assert.equal(s.exercises, 3);
  assert.equal(s.sets, 4);
  assert.equal(s.rowsSkipped, 0);
  assert.equal(s.weightUnitKnown, false);
  assert.deepEqual(s.firstWorkouts, [
    { name: 'Full Body B', count: 3 },
    { name: 'Full Body A', count: 1 },
  ]);
});

test('summarizeWorkoutCsv flags a CSV whose columns it cannot map', () => {
  const s = summarizeWorkoutCsv('foo,bar\n1,2\n');
  assert.equal(s.workouts, 0);
  assert.equal(s.unmapped, true);
});

// --- Workout duration ---------------------------------------------------------
test('parseCsvDuration reads the formats exports actually use', () => {
  assert.equal(parseCsvDuration('24m'), 24 * 60);
  assert.equal(parseCsvDuration('39m'), 39 * 60);
  assert.equal(parseCsvDuration('1h'), 3600);
  assert.equal(parseCsvDuration('1h 5m'), 3900);
  assert.equal(parseCsvDuration('1h5m30s'), 3930);
  assert.equal(parseCsvDuration('90s'), 90);
  assert.equal(parseCsvDuration('45 min'), 45 * 60);
  assert.equal(parseCsvDuration('0m'), 0);
  // Clock form: two parts read as mm:ss, three as h:mm:ss.
  assert.equal(parseCsvDuration('45:00'), 45 * 60);
  assert.equal(parseCsvDuration('1:05:30'), 3930);
});

test('parseCsvDuration refuses to guess a bare number', () => {
  // Seconds or minutes? Wrong either way is a wildly wrong workout length.
  assert.equal(parseCsvDuration('24'), null);
  assert.equal(parseCsvDuration('garbage'), null);
  assert.equal(parseCsvDuration(''), null);
});

test('parseWorkoutCsv takes duration from a Duration column', () => {
  const parsed = parseWorkoutCsv(TITLECASE_CSV);
  assert.equal(parsed.workouts[0].durationSeconds, 24 * 60);
  assert.equal(parsed.workouts[0].endedAt, parsed.workouts[0].startedAt! + 24 * 60 * 1000);
  assert.equal(parsed.workouts[1].durationSeconds, 39 * 60);
});

test('our own export round-trips duration through end_time', () => {
  const startedAt = new Date(2026, 6, 10, 9, 0).getTime();
  const endedAt = new Date(2026, 6, 10, 10, 30).getTime();
  const csv = toWorkoutCsv([
    {
      name: 'Push', startedAt, endedAt, notes: null,
      exercises: [{ name: 'Bench Press', note: null, supersetGroup: null,
        sets: [{ position: 0, type: 'normal', weight: 60, reps: 8 }] }],
    },
  ]);
  const w = parseWorkoutCsv(csv).workouts[0];
  assert.equal(w.endedAt, endedAt);
  assert.equal(w.durationSeconds, 90 * 60);
});

test('a workout with neither duration nor end time reports null, not zero', () => {
  const csv = 'Workout Name,Exercise Name,Weight,Reps\nPush,Bench,60,8\n';
  const w = parseWorkoutCsv(csv).workouts[0];
  assert.equal(w.durationSeconds, null);
  assert.equal(w.endedAt, null);
});
