/**
 * On-device schema. Enums are stored as text. Timestamps are ms since epoch
 * (integer) for cheap comparison. Every user-owned table carries updatedAt
 * (a conflict clock, also used for ordering) plus the vestigial deleted/dirty
 * columns below.
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Columns every user-owned table shares. `deleted` (tombstone) and `dirty`
 * (unsynced) are retained but unused now that the app is purely on-device;
 * they are kept so the shape stays stable and are not written meaningfully.
 */
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
  // Mirrors workout_exercises: partners share a value. Without it a superset
  // survived the workout but not the routine it came from.
  supersetGroup: integer('superset_group'),
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
  // The user's bodyweight (kg) snapshotted at finish, so bodyweight movements
  // count toward this workout's volume at the mass they were performed. Null on
  // workouts finished before the feature (and pre-feature history); the volume
  // math then falls back to the current bodyweight setting or contributes 0.
  bodyweightKg: real('bodyweight_kg'),
  // This workout's entry in Apple Health (#90): the HKWorkout's UUID, and who
  // wrote it — 'phone' (Ischys, which may replace it when the workout's time
  // is edited) or 'watch' (a recording, which is never altered). Both null
  // when there is no entry, Health is not connected, or the workout predates
  // this and has not been looked up yet (see lib/healthSync.ts). A pointer
  // into this device's Health store, so it is not exported or imported.
  healthWorkoutUuid: text('health_workout_uuid'),
  healthWorkoutWriter: text('health_workout_writer'),
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
  // How hard the set was (#84). Always RPE, on a half-step grid; RIR is a way
  // of showing it (10 − RPE), so switching the setting never rewrites history.
  // Null for an unrated set. See domain/effort.ts.
  rpe: real('rpe'),
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

/**
 * Body measurements over time (#65).
 *
 * `value` is always canonical — cm for lengths, kg for masses, a plain number
 * for percentages — so a unit change is a display concern and never rewrites
 * history.
 *
 * `source` separates what the user typed from what arrived via Apple Health.
 * Health rows are read-only here and carry `healthUuid`, so a re-read updates
 * the same row instead of appending a duplicate every sync.
 */
export const bodyMeasurements = sqliteTable('body_measurements', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  metric: text('metric').notNull(),
  value: real('value').notNull(),
  measuredAt: integer('measured_at').notNull(),
  source: text('source').notNull().default('manual'),
  healthUuid: text('health_uuid'),
  ...sync,
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  unit: text('unit').notNull().default('kg'),
  autoStartRestTimer: integer('auto_start_rest_timer').notNull().default(1),
  restTimerAlerts: integer('rest_timer_alerts').notNull().default(1),
  hapticFeedback: integer('haptic_feedback').notNull().default(1),
  // 'off' | 'rpe' | 'rir' (#84). Off hides every rating but deletes none.
  effortMode: text('effort_mode').notNull().default('off'),
  // Legacy, unused (purely on-device — no sync). Kept mapped so the migration
  // snapshot stays consistent; dropping them would rebuild the settings table on
  // live data for no user-facing gain. The API type/repo no longer expose them.
  serverUrl: text('server_url'),
  lastSyncedAt: integer('last_synced_at'),
  ...sync,
});
