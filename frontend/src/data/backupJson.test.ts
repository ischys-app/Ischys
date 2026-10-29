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
