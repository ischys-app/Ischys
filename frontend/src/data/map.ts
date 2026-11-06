/**
 * Row → DTO translation for the local repo. Pure (no DB imports), so the
 * shape logic is unit-testable with fixture rows. The repo does the SQLite
 * fetch/join and hands already-loaded rows here. SQLite stores epoch-ms
 * integers and 0/1 booleans; the DTOs (mirroring the old server responses) want
 * ISO strings and real booleans. Catalog names are display labels here (the
 * stored English rides along as `englishName`); exports never read these DTOs.
 */
import type {
  CategoryOut,
  ExerciseKind,
  ExerciseOut,
  HistorySessionOut,
  MuscleOut,
  RoutineExerciseOut,
  RoutineOut,
  RoutineSetOut,
  SetType,
  WorkoutExerciseOut,
  WorkoutListItem,
  WorkoutOut,
  WorkoutSetOut,
  WorkoutStatus,
} from '../api/types.ts';
import type { Lang } from '../i18n/locale.ts';
import { getLang } from '../i18n/current.ts';
import { categoryLabel, exerciseLabel, muscleLabel } from '../i18n/catalogNames.ts';

// --- Row shapes (mirror src/db/schema.ts columns; kept local so this stays pure) ---
export type ExerciseRow = {
  id: string;
  userId: string | null;
  name: string;
  initials: string;
  kind: string;
  equipment: string;
  categoryId: string | null;
  primaryMuscleId: string | null;
  howToSteps: string[] | null;
  source: string | null;
  externalId: string | null;
  isCustom: number;
  imageUrl: string | null;
  imageAuthor: string | null;
  demoUrl: string | null;
};
export type CategoryRow = { id: string; name: string };
export type MuscleRow = { id: string; name: string; group: string | null };
export type WorkoutRow = {
  id: string;
  routineId: string | null;
  name: string;
  status: string;
  startedAt: number;
  endedAt: number | null;
  durationSeconds: number;
  totalVolume: number;
  totalSets: number;
  prCount: number;
  avgHr: number | null;
  maxHr: number | null;
};
export type WorkoutExerciseRow = {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  restSeconds: number;
  note: string | null;
  supersetGroup: number | null;
};
export type WorkoutSetRow = {
  id: string;
  workoutExerciseId: string;
  position: number;
  type: string;
  weight: number | null;
  reps: number | null;
  done: number;
  isPr: number;
  /** Effort as RPE. Optional so rows read before the column existed still fit. */
  rpe?: number | null;
};
export type RoutineRow = { id: string; name: string; initials: string; position: number };
export type RoutineExerciseRow = {
  id: string;
  exerciseId: string;
  position: number;
  restSeconds: number;
  note: string | null;
  supersetGroup?: number | null;
};
export type RoutineSetRow = {
  id: string;
  position: number;
  type: string;
  targetWeight: number | null;
  targetReps: number | null;
};

const iso = (ms: number): string => new Date(ms).toISOString();
const isoOrNull = (ms: number | null): string | null => (ms === null ? null : iso(ms));
const bool = (n: number): boolean => n !== 0;

// `name` is what the UI shows (the catalog label in the display language);
// `englishName` is the stored value, for anything that must not change.
export const toCategoryOut = (c: CategoryRow, lang: Lang = getLang()): CategoryOut => ({
  id: c.id,
  name: categoryLabel(c, lang),
  englishName: c.name,
});
export const toMuscleOut = (m: MuscleRow, lang: Lang = getLang()): MuscleOut => ({
  id: m.id,
  name: muscleLabel(m, lang),
  englishName: m.name,
  group: m.group,
});

export function toExerciseOut(
  ex: ExerciseRow,
  category: CategoryRow | null,
  primaryMuscle: MuscleRow | null,
  secondaryMuscles: MuscleRow[],
  lang: Lang = getLang(),
): ExerciseOut {
  return {
    id: ex.id,
    name: exerciseLabel(ex, lang),
    englishName: ex.name,
    initials: ex.initials,
    kind: ex.kind as ExerciseKind,
    equipment: ex.equipment,
    is_custom: bool(ex.isCustom),
    category: category ? toCategoryOut(category, lang) : null,
    primary_muscle: primaryMuscle ? toMuscleOut(primaryMuscle, lang) : null,
    secondary_muscles: secondaryMuscles.map((m) => toMuscleOut(m, lang)),
    how_to_steps: ex.howToSteps,
    image_url: ex.imageUrl,
    image_author: ex.imageAuthor,
    demo_url: ex.demoUrl,
  };
}

export const toWorkoutSetOut = (s: WorkoutSetRow): WorkoutSetOut => ({
  id: s.id,
  position: s.position,
  type: s.type as SetType,
  weight: s.weight,
  reps: s.reps,
  done: bool(s.done),
  is_pr: bool(s.isPr),
  rpe: s.rpe ?? null,
});

export const toWorkoutExerciseOut = (
  we: WorkoutExerciseRow,
  exercise: ExerciseOut,
  sets: WorkoutSetRow[],
): WorkoutExerciseOut => ({
  id: we.id,
  position: we.position,
  rest_seconds: we.restSeconds,
  note: we.note,
  superset_group: we.supersetGroup,
  exercise,
  sets: sets.map(toWorkoutSetOut),
});

export const toWorkoutOut = (w: WorkoutRow, exercises: WorkoutExerciseOut[]): WorkoutOut => ({
  id: w.id,
  name: w.name,
  status: w.status as WorkoutStatus,
  routine_id: w.routineId,
  started_at: iso(w.startedAt),
  ended_at: isoOrNull(w.endedAt),
  duration_seconds: w.durationSeconds,
  total_volume: w.totalVolume,
  total_sets: w.totalSets,
  pr_count: w.prCount,
  avg_hr: w.avgHr,
  max_hr: w.maxHr,
  exercises,
});

export const toWorkoutListItem = (w: WorkoutRow, muscleTags: string[]): WorkoutListItem => ({
  id: w.id,
  name: w.name,
  status: w.status,
  started_at: iso(w.startedAt),
  duration_seconds: w.durationSeconds,
  total_volume: w.totalVolume,
  total_sets: w.totalSets,
  pr_count: w.prCount,
  muscle_tags: muscleTags,
});

export const toRoutineSetOut = (s: RoutineSetRow): RoutineSetOut => ({
  id: s.id,
  position: s.position,
  type: s.type as SetType,
  target_weight: s.targetWeight,
  target_reps: s.targetReps,
});

export const toRoutineExerciseOut = (
  re: RoutineExerciseRow,
  exercise: ExerciseOut,
  sets: RoutineSetRow[],
): RoutineExerciseOut => ({
  id: re.id,
  position: re.position,
  rest_seconds: re.restSeconds,
  superset_group: re.supersetGroup ?? null,
  note: re.note,
  exercise,
  sets: sets.map(toRoutineSetOut),
});

export const toRoutineOut = (r: RoutineRow, exercises: RoutineExerciseOut[]): RoutineOut => ({
  id: r.id,
  name: r.name,
  initials: r.initials,
  position: r.position,
  exercises,
});

/** Routine list "detail": first 6 exercise names, then "+N" (mirrors serializers.py). */
export function routineDetail(exerciseNames: string[]): string {
  const head = exerciseNames.slice(0, 6).join(', ');
  const extra = exerciseNames.length > 6 ? ` +${exerciseNames.length - 6}` : '';
  return head + extra;
}

export const toHistorySession = (
  workoutId: string,
  startedAtMs: number,
  sets: WorkoutSetRow[],
): HistorySessionOut => ({
  workout_id: workoutId,
  date: iso(startedAtMs),
  has_pr: sets.some((s) => bool(s.isPr)),
  sets: sets.map((s) => ({
    position: s.position,
    type: s.type as SetType,
    weight: s.weight,
    reps: s.reps,
    is_pr: bool(s.isPr),
    rpe: s.rpe ?? null,
  })),
});
