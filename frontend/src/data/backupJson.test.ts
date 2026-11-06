/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { backupWorkouts, readJsonSet, toJsonSet } from './backupJson.ts';

test('a rated set round-trips through the JSON backup', () => {
  const set = { type: 'normal', weight: 60, reps: 8, done: true, isPr: true, rpe: 8.5 };
  const json = JSON.parse(JSON.stringify(toJsonSet(set)));
  assert.deepEqual(json, { type: 'normal', weight_kg: 60, reps: 8, done: true, is_pr: true, rpe: 8.5 });
  assert.deepEqual(readJsonSet(json), set);
});

test('an unrated set writes null and reads back unrated', () => {
  const set = { type: 'warmup', weight: null, reps: 12, done: true, isPr: false, rpe: null };
  const json = JSON.parse(JSON.stringify(toJsonSet(set)));
  assert.equal(json.rpe, null);
  assert.deepEqual(readJsonSet(json), set);
});

test('a backup written before ratings existed still imports', () => {
  const old = { type: 'normal', weight_kg: 100, reps: 5, done: true, is_pr: false };
  assert.deepEqual(readJsonSet(old), {
    type: 'normal', weight: 100, reps: 5, done: true, isPr: false, rpe: null,
  });
});

test('reading fills the same defaults the import always used', () => {
  // Exported workouts are completed, so a missing `done` means done.
  assert.deepEqual(readJsonSet({}), {
    type: 'normal', weight: null, reps: null, done: true, isPr: false, rpe: null,
  });
  assert.equal(readJsonSet({ done: false }).done, false);
});

test('a rating that is not one is dropped, not stored', () => {
  assert.equal(readJsonSet({ rpe: 'hard' as unknown as number }).rpe, null);
  assert.equal(readJsonSet({ rpe: 14 }).rpe, null);
  assert.equal(readJsonSet({ rpe: 7.4 }).rpe, 7.5);
});

test("a backup's `profile` key is read past: the import plan is the same without it", () => {
  const workouts = [
    { name: 'Push', started_at: '2026-10-20T08:00:00Z', exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }] },
  ];
  const plain = JSON.stringify({ exported_at: '2026-10-29T10:00:00Z', workouts });
  const named = JSON.stringify({ exported_at: '2026-10-29T10:00:00Z', profile: { name: 'Maria', initials: 'MP' }, workouts });
  assert.deepEqual(backupWorkouts(named), backupWorkouts(plain));
  assert.deepEqual(backupWorkouts(named), workouts);
});

test('a file with no workouts list is not a backup, and text that is not JSON throws', () => {
  assert.equal(backupWorkouts(JSON.stringify({ profile: { name: 'Maria', initials: 'MP' } })), null);
  assert.throws(() => backupWorkouts('not json'));
});

// --- Exports stay English whatever the display language (#136) ---------------
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zhCatalog from '../i18n/catalog/zh-Hans.json' with { type: 'json' };
import { getLang, setLang } from '../i18n/current.ts';
import { exerciseLabel } from '../i18n/catalogNames.ts';
import { toBackupJson, type BackupWorkout } from './backupJson.ts';
import { toWorkoutCsv } from './workoutCsv.ts';

test('backup JSON and CSV are byte-identical under zh-Hans and en', () => {
  const bench = catalog.exercises.find((e) => e.name === 'Barbell Bench Press - Medium Grip')!;
  const squat = catalog.exercises.find((e) => e.name === 'Barbell Squat')!;
  const zhEx = (zhCatalog as unknown as { exercises: Record<string, string> }).exercises;
  const set = { position: 0, type: 'normal', weight: 60, reps: 8, done: true, isPr: false, rpe: null };
  // Stored names, as the exporter reads them off the exercises table: a
  // built-in, a renamed built-in (stored name differs from the catalog) and a custom.
  const workouts: BackupWorkout[] = [
    {
      id: 'w1', name: 'Workout', startedAt: Date.UTC(2026, 10, 1, 8), endedAt: Date.UTC(2026, 10, 1, 9), notes: null,
      durationSeconds: 3600, totalVolume: 480, totalSets: 3, prCount: 0,
      exercises: [
        { name: bench.name, note: null, supersetGroup: null, sets: [set] },
        { name: 'My squat', note: null, supersetGroup: null, sets: [set] },
        { name: 'Zercher Hold', note: 'custom', supersetGroup: 1, sets: [set] },
      ],
    },
  ];
  const profile = { name: 'Me', initials: 'ME' };
  const before = getLang();
  zhEx[bench.id] = '卧推';
  zhEx[squat.id] = '深蹲';
  try {
    setLang('en');
    const enJson = toBackupJson(workouts, profile);
    const enCsv = toWorkoutCsv(workouts);
    setLang('zh-Hans');
    // The fixture is sensitive: the same row does display translated under zh.
    assert.equal(exerciseLabel({ id: bench.id, name: bench.name }, getLang()), '卧推');
    assert.equal(toBackupJson(workouts, profile), enJson);
    assert.equal(toWorkoutCsv(workouts), enCsv);
    assert.ok(enJson.includes(bench.name) && !enJson.includes('卧推'));
    assert.ok(enCsv.includes(bench.name) && !enCsv.includes('卧推'));
  } finally {
    setLang(before);
    delete zhEx[bench.id];
    delete zhEx[squat.id];
  }
});
