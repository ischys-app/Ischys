/**
 * On-device schema, mirroring backend/app/models/tables.py so sync is ~1:1.
 * Enums are stored as text (values match the Python enums). Timestamps are ms
 * since epoch (integer) for cheap comparison. Every user-owned table carries
 * sync columns: updatedAt (conflict clock), deleted (tombstone), dirty (unsynced).
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Columns every user-owned table shares for sync. */
const sync = {
  updatedAt: integer('updated_at').notNull().default(0),
  deleted: integer('deleted').notNull().default(0),
  dirty: integer('dirty').notNull().default(0),
};

// --- Catalog lookups (shared, not user-owned, not synced) ---
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const muscles = sqliteTable('muscles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  group: text('group'),
});

// --- Exercises: shared catalog rows (user_id null) + custom rows (user_id set) ---
export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  initials: text('initials').notNull().default(''),
  kind: text('kind').notNull().default('weighted'),
  equipment: text('equipment').notNull().default('other'),
  categoryId: text('category_id'),
  primaryMuscleId: text('primary_muscle_id'),
  howToSteps: text('how_to_steps', { mode: 'json' }).$type<string[] | null>(),
  source: text('source'),
  externalId: text('external_id'),
  isCustom: integer('is_custom').notNull().default(0),
  imageUrl: text('image_url'),
  imageAuthor: text('image_author'),
  demoUrl: text('demo_url'),
  ...sync,
});

export const exerciseSecondaryMuscles = sqliteTable(
  'exercise_secondary_muscles',
  {
    exerciseId: text('exercise_id').notNull(),
    muscleId: text('muscle_id').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.exerciseId, t.muscleId] }) }),
);

export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  name: text('name').notNull(),
  initials: text('initials').notNull().default(''),
  position: integer('position').notNull().default(0),
  ...sync,
});

export const routineExercises = sqliteTable('routine_exercises', {
  id: text('id').primaryKey(),
  routineId: text('routine_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  restSeconds: integer('rest_seconds').notNull().default(120),
  note: text('note'),
  ...sync,
});

export const routineSets = sqliteTable('routine_sets', {
  id: text('id').primaryKey(),
  routineExerciseId: text('routine_exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  type: text('type').notNull().default('normal'),
  targetWeight: real('target_weight'),
  targetReps: integer('target_reps'),
  ...sync,
});

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  routineId: text('routine_id'),
  name: text('name').notNull().default('Workout'),
  status: text('status').notNull().default('active'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  notes: text('notes'),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  totalVolume: real('total_volume').notNull().default(0),
  totalSets: integer('total_sets').notNull().default(0),
  prCount: integer('pr_count').notNull().default(0),
  avgHr: integer('avg_hr'),
  maxHr: integer('max_hr'),
  ...sync,
});

export const workoutExercises = sqliteTable('workout_exercises', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  restSeconds: integer('rest_seconds').notNull().default(120),
  note: text('note'),
  supersetGroup: integer('superset_group'),
  ...sync,
});

export const workoutSets = sqliteTable('workout_sets', {
  id: text('id').primaryKey(),
  workoutExerciseId: text('workout_exercise_id').notNull(),
  position: integer('position').notNull().default(0),
  type: text('type').notNull().default('normal'),
  weight: real('weight'),
  reps: integer('reps'),
  done: integer('done').notNull().default(0),
  isPr: integer('is_pr').notNull().default(0),
  completedAt: integer('completed_at'),
  ...sync,
});

export const personalRecords = sqliteTable('personal_records', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  exerciseId: text('exercise_id').notNull(),
  metric: text('metric').notNull(),
  value: real('value').notNull(),
  display: text('display').notNull().default(''),
  achievedAt: integer('achieved_at'),
  workoutSetId: text('workout_set_id'),
  ...sync,
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  unit: text('unit').notNull().default('kg'),
  autoStartRestTimer: integer('auto_start_rest_timer').notNull().default(1),
  restTimerAlerts: integer('rest_timer_alerts').notNull().default(1),
  hapticFeedback: integer('haptic_feedback').notNull().default(1),
  serverUrl: text('server_url'),
  lastSyncedAt: integer('last_synced_at'),
  ...sync,
});
