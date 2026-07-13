/**
 * Row → DTO translation for the local repo. Pure (type-only imports), so the
 * shape logic is unit-testable with fixture rows. The repo does the SQLite
 * fetch/join and hands already-loaded rows here. SQLite stores epoch-ms
 * integers and 0/1 booleans; the DTOs (mirroring the old server responses) want
 * ISO strings and real booleans.
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
};
export type RoutineRow = { id: string; name: string; initials: string; position: number };
export type RoutineExerciseRow = {
  id: string;
  exerciseId: string;
  position: number;
  restSeconds: number;
  note: string | null;
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

export const toCategoryOut = (c: CategoryRow): CategoryOut => ({ id: c.id, name: c.name });
export const toMuscleOut = (m: MuscleRow): MuscleOut => ({ id: m.id, name: m.name, group: m.group });

export function toExerciseOut(
  ex: ExerciseRow,
  category: CategoryRow | null,
  primaryMuscle: MuscleRow | null,
  secondaryMuscles: MuscleRow[],
): ExerciseOut {
  return {
    id: ex.id,
    name: ex.name,
    initials: ex.initials,
    kind: ex.kind as ExerciseKind,
    equipment: ex.equipment,
    is_custom: bool(ex.isCustom),
    category: category ? toCategoryOut(category) : null,
    primary_muscle: primaryMuscle ? toMuscleOut(primaryMuscle) : null,
    secondary_muscles: secondaryMuscles.map(toMuscleOut),
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
  })),
});
