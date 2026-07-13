/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  routineDetail,
  toExerciseOut,
  toHistorySession,
  toWorkoutListItem,
  toWorkoutOut,
  type ExerciseRow,
  type MuscleRow,
  type WorkoutRow,
  type WorkoutSetRow,
} from './map.ts';

const exRow = (over: Partial<ExerciseRow> = {}): ExerciseRow => ({
  id: 'e1',
  userId: null,
  name: 'Pull Up',
  initials: 'PU',
  kind: 'bodyweight',
  equipment: 'bodyweight',
  categoryId: 'c1',
  primaryMuscleId: 'm1',
  howToSteps: ['Hang', 'Pull'],
  source: 'free-exercise-db',
  externalId: 'Pull_Up',
  isCustom: 0,
  imageUrl: null,
  imageAuthor: null,
  demoUrl: null,
  ...over,
});
const lats: MuscleRow = { id: 'm1', name: 'Lats', group: 'Back' };

test('toExerciseOut maps snake_case, booleans, nested muscle', () => {
  const out = toExerciseOut(exRow(), { id: 'c1', name: 'Back' }, lats, [lats]);
  assert.equal(out.is_custom, false);
  assert.deepEqual(out.how_to_steps, ['Hang', 'Pull']);
  assert.equal(out.category!.name, 'Back');
  assert.equal(out.primary_muscle!.group, 'Back');
  assert.equal(out.secondary_muscles!.length, 1);
});

test('toWorkoutOut renders dates as ISO, booleans, nesting', () => {
  const w: WorkoutRow = {
    id: 'w1',
    routineId: null,
    name: 'Push',
    status: 'completed',
    startedAt: Date.UTC(2026, 6, 10, 8, 0, 0),
    endedAt: Date.UTC(2026, 6, 10, 9, 0, 0),
    durationSeconds: 3600,
    totalVolume: 1200,
    totalSets: 12,
    prCount: 1,
    avgHr: 130,
    maxHr: 160,
  };
  const set: WorkoutSetRow = { id: 's1', position: 0, type: 'normal', weight: 60, reps: 8, done: 1, isPr: 1 };
  const ex = toExerciseOut(exRow({ id: 'e1' }), null, null, []);
  const out = toWorkoutOut(w, [
    { id: 'we1', position: 0, rest_seconds: 120, note: null, superset_group: null, exercise: ex, sets: [] as never },
  ] as never);
  assert.equal(out.started_at, '2026-07-10T08:00:00.000Z');
  assert.equal(out.ended_at, '2026-07-10T09:00:00.000Z');
  assert.equal(out.status, 'completed');
  assert.equal(out.avg_hr, 130);
  assert.equal(typeof out.total_volume, 'number');
  // set booleans map through the set mapper
  assert.equal(toHistorySession('w1', w.startedAt, [set]).sets[0].is_pr, true);
});

test('toWorkoutListItem carries muscle tags + ISO date', () => {
  const w: WorkoutRow = {
    id: 'w1',
    routineId: null,
    name: 'Push',
    status: 'completed',
    startedAt: Date.UTC(2026, 6, 10),
    endedAt: null,
    durationSeconds: 0,
    totalVolume: 0,
    totalSets: 0,
    prCount: 0,
    avgHr: null,
    maxHr: null,
  };
  const item = toWorkoutListItem(w, ['Chest', 'Back']);
  assert.deepEqual(item.muscle_tags, ['Chest', 'Back']);
  assert.equal(item.started_at, '2026-07-10T00:00:00.000Z');
});

test('toHistorySession flags has_pr and ends null on no PR set', () => {
  const sets: WorkoutSetRow[] = [
    { id: 's1', position: 0, type: 'normal', weight: 60, reps: 8, done: 1, isPr: 0 },
  ];
  const h = toHistorySession('w1', Date.UTC(2026, 6, 10), sets);
  assert.equal(h.has_pr, false);
  assert.equal(h.sets[0].weight, 60);
});

test('routineDetail lists first 6 then +N', () => {
  assert.equal(routineDetail(['A', 'B', 'C']), 'A, B, C');
  assert.equal(routineDetail(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']), 'A, B, C, D, E, F +2');
});
