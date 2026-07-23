/** Request/response shapes for the app's data layer (src/data). */

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export type DashboardStats = {
  workouts_done: number;
  workouts_target: number;
  volume: number;
  sets: number;
  time_seconds: number;
  streak_days: number;
};

export type WeekBar = { label: string; volume: number; today: boolean };

export type RoutineListItem = {
  id: string;
  name: string;
  initials: string;
  position: number;
  exercise_count: number;
  set_count: number;
  detail: string;
};

export type WorkoutListItem = {
  id: string;
  name: string;
  status: string;
  started_at: string;
  duration_seconds: number;
  total_volume: number;
  total_sets: number;
  pr_count: number;
  muscle_tags: string[];
};

/** One day cell in the 12-week activity heatmap. Intensity 0..3. */
export type ActivityDay = { date: string; intensity: number };

/** The N-week activity heatmap: session count plus per-day intensities. */
export type ActivityMapOut = { weeks: number; sessions: number; days: ActivityDay[] };

export type Dashboard = {
  date: string;
  stats: DashboardStats;
  week: WeekBar[];
  routines: RoutineListItem[];
  recent: WorkoutListItem[];
};

// --- Active workout ---

export type ExerciseKind = 'weighted' | 'bodyweight';

export type CategoryOut = {
  id: string;
  name: string;
};

export type MuscleOut = {
  id: string;
  name: string;
  group?: string | null;
};

export type ExerciseOut = {
  id: string;
  name: string;
  initials: string;
  kind: ExerciseKind;
  equipment: string;
  is_custom?: boolean;
  category?: CategoryOut | null;
  primary_muscle?: MuscleOut | null;
  secondary_muscles?: MuscleOut[];
  how_to_steps?: string[] | null;
  /** Image reference; resolve to a displayable URL with `mediaUrl(image_url)`. */
  image_url?: string | null;
  /** Attribution, when the source requires one. Public-domain images have none. */
  image_author?: string | null;
  /** User-supplied demo media, set from the Exercise Detail "About" tab. */
  demo_url?: string | null;
};

export type WorkoutSetOut = {
  id: string;
  position: number;
  type: SetType;
  weight: number | null;
  reps: number | null;
  done: boolean;
  is_pr: boolean;
};

export type WorkoutExerciseOut = {
  id: string;
  position: number;
  rest_seconds: number;
  note?: string | null;
  superset_group?: number | null;
  exercise: ExerciseOut;
  sets: WorkoutSetOut[];
};

/** Lifecycle status of a workout. */
export type WorkoutStatus = 'active' | 'completed' | 'discarded';

export type WorkoutOut = {
  id: string;
  name: string;
  status: WorkoutStatus;
  routine_id?: string | null;
  started_at: string;
  ended_at?: string | null;
  duration_seconds: number;
  total_volume: number;
  total_sets: number;
  pr_count: number;
  /** Null when the session was logged without a paired Apple Watch. */
  avg_hr?: number | null;
  max_hr?: number | null;
  exercises: WorkoutExerciseOut[];
};

export type PreviousSetOut = {
  position: number;
  type: SetType;
  weight: number | null;
  reps: number | null;
};

export type WorkoutSummaryOut = {
  workout: WorkoutOut;
  prs: {
    exercise_id: string;
    exercise_name: string;
    metric: string;
    display: string;
    delta_display: string;
  }[];
  volume_by_muscle: { name: string; sets: number }[];
};

// --- Exercise Detail ---

/** One set within a HistorySessionOut. Weight is kg (nullable for bodyweight). */
export type HistorySetOut = {
  position: number;
  type: SetType;
  weight: number | null;
  reps: number | null;
  is_pr: boolean;
};

/** One past session for a single exercise, from its logged history. */
export type HistorySessionOut = {
  workout_id: string;
  date: string;
  has_pr: boolean;
  sets: HistorySetOut[];
};

/** Personal record metric slug used by the records logic. */
export type RecordMetric = 'best_set' | 'est_1rm' | 'best_volume' | 'max_reps';

/** One personal-record card for an exercise. */
export type RecordOut = {
  metric: RecordMetric;
  value: number;
  display: string;
  achieved_at?: string | null;
  /** Set on recent-record entries so the Profile list can name the lift. */
  exercise_name?: string | null;
};

/** Chart series for a single exercise's progress over time. */
export type ChartOut = {
  metric: RecordMetric;
  labels: string[];
  values: number[];
};

// --- Profile ---

/** Aggregate lifetime stats surfaced on the Profile tab. */
export type ProfileStats = {
  workouts: number;
  this_year: number;
  /** kg */
  volume_lifted: number;
  /** weeks */
  current_streak: number;
};

/** Profile payload surfaced on the Profile tab. */
export type ProfileOut = {
  id: string;
  name: string;
  email?: string | null;
  location?: string | null;
  /** ISO date (YYYY-MM-DD) — start of training. */
  training_since?: string | null;
  stats: ProfileStats;
};

// --- Routines (builder) ---

/** One target set within a saved routine (position-ordered). */
export type RoutineSetOut = {
  id: string;
  position: number;
  type: SetType;
  target_weight?: number | null;
  target_reps?: number | null;
};

/** One exercise within a saved routine, with target sets. */
export type RoutineExerciseOut = {
  id: string;
  position: number;
  rest_seconds: number;
  note?: string | null;
  exercise: ExerciseOut;
  sets: RoutineSetOut[];
};

/** Full routine payload, with its exercises and target sets. */
export type RoutineOut = {
  id: string;
  name: string;
  initials: string;
  position: number;
  exercises: RoutineExerciseOut[];
};

/** Target set input shape when creating/updating a routine. */
export type RoutineSetIn = {
  type: SetType;
  target_weight?: number | null;
  target_reps?: number | null;
};

/** Exercise input shape when creating/updating a routine. */
export type RoutineExerciseIn = {
  exercise_id: string;
  rest_seconds: number;
  note?: string | null;
  sets: RoutineSetIn[];
};

// --- Settings ---

export type Unit = 'kg' | 'lb';
export type SyncFrequency = 'live' | 'interval' | 'manual';

/** Full locally-persisted settings payload. */
export type SettingsOut = {
  unit: Unit;
  auto_start_rest_timer: boolean;
  rest_timer_alerts: boolean;
  haptic_feedback: boolean;
  sync_frequency: SyncFrequency;
  server_url: string;
  last_synced_at?: string | null;
};

/** Any subset — the fields to change when updating settings. */
export type SettingsUpdate = Partial<SettingsOut>;

// --- Import ---

/** Result of a workout CSV import — counts of what landed after mapping the rows. */
export type ImportResult = {
  workouts_created: number;
  exercises_created: number;
  sets_imported: number;
  rows_skipped: number;
  warnings: string[];
};
