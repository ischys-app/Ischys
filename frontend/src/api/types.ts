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
  /** Effort, always as RPE (see domain/effort.ts). Null when unrated. */
  rpe: number | null;
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
  /** That set's effort, as RPE. Null when it was not rated. */
  rpe: number | null;
};

export type WorkoutSummaryOut = {
  workout: WorkoutOut;
  prs: {
    exercise_id: string;
    exercise_name: string;
    metric: RecordMetric;
    /** The record's value in its stored unit (kg, kg of volume, or reps). */
    value: number;
    /** The improvement, in that same unit; null for a first-ever record. */
    delta: number | null;
    /**
     * Kilogram prose, as stored. Not for the screen as-is: render both through
     * `recordDisplay` / `recordDeltaDisplay` (domain/records.ts) with the
     * user's unit.
     */
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
  /** Effort, as RPE. Null when unrated. */
  rpe: number | null;
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
  /** The set this record came from. Present when that set still exists, so a
   *  record card can hand its numbers to the 1RM calculator. */
  weight?: number | null;
  reps?: number | null;
};

/** Chart series for a single exercise's progress over time. */
export type ChartOut = {
  metric: RecordMetric;
  labels: string[];
  values: number[];
  /** Epoch ms of each point, so the chart can place it on a real time axis
   *  rather than spacing sessions evenly and hiding the gaps between them. */
  times: number[];
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
  /** Shared by exercises paired as a superset. Null for an ordinary one. */
  superset_group?: number | null;
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
  superset_group?: number | null;
  note?: string | null;
  sets: RoutineSetIn[];
};

// --- Settings ---

export type Unit = 'kg' | 'lb';

/** Effort per set: hidden, or shown as RPE or as RIR. */
export type EffortMode = 'off' | 'rpe' | 'rir';

/** Full locally-persisted settings payload. */
export type SettingsOut = {
  unit: Unit;
  effort_mode: EffortMode;
  auto_start_rest_timer: boolean;
  rest_timer_alerts: boolean;
  haptic_feedback: boolean;
};

/** Any subset — the fields to change when updating settings. */
export type SettingsUpdate = Partial<SettingsOut>;

// --- Import ---

/**
 * One completed workout an import created. The counts below say how much landed;
 * this says *what*, which is what the success screen needs to offer rebuilding
 * routines from the imported history (board 12a) — a title alone can't be turned
 * into a routine, only a specific session can.
 *
 * Untitled workouts are not reported: there is no name to offer.
 */
export type ImportedSession = {
  workout_id: string;
  /** The workout's name as the file spelled it; never blank. */
  title: string;
  /** Epoch ms. */
  started_at: number;
  exercise_count: number;
};

/** Result of a workout CSV import — counts of what landed after mapping the rows. */
export type ImportResult = {
  workouts_created: number;
  exercises_created: number;
  sets_imported: number;
  rows_skipped: number;
  warnings: string[];
  /**
   * The titled workouts this import created, in the order they were written.
   * Empty when the import created nothing, or nothing with a name — both import
   * paths populate it, because a JSON backup carries no routines either.
   */
  imported_sessions: ImportedSession[];
};
