/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseCsv, parseHevy, parseHevyTime, toHevyCsv, type ExportWorkout } from './hevyCsv.ts';

test('parseCsv handles quoted fields with commas', () => {
  const rows = parseCsv('a,b\n"x,y",z\n');
  assert.deepEqual(rows, [
    ['a', 'b'],
    ['x,y', 'z'],
  ]);
});

test('parseHevyTime parses the Hevy timestamp', () => {
  const ms = parseHevyTime('10 Jul 2026, 09:05');
  assert.equal(ms, new Date(2026, 6, 10, 9, 5).getTime());
  assert.equal(parseHevyTime('garbage'), null);
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
  const csv = toHevyCsv(workouts);
  const parsed = parseHevy(csv);
  assert.equal(parsed.workouts.length, 1);
  const w = parsed.workouts[0];
  assert.equal(w.title, 'Push');
  assert.equal(w.startedAt, workouts[0].startedAt);
  assert.equal(w.exercises[0].title, 'Bench Press');
  assert.deepEqual(w.exercises[0].sets, [
    { type: 'warmup', weight: 40, reps: 10 },
    { type: 'normal', weight: 60, reps: 8 },
  ]);
});

test('rows missing title/exercise are skipped', () => {
  const csv = 'title,start_time,exercise_title,set_type,weight_kg,reps\n,,,normal,60,8\nPush,10 Jul 2026, 09:00,Bench,normal,60,8\n';
  const parsed = parseHevy(csv);
  assert.ok(parsed.rowsSkipped >= 1);
});
