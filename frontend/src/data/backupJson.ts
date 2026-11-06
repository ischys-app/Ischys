/**
 * The shape of one set in the JSON backup, both ways. Pure — no DB — so the
 * round trip is node-tested; exportRepo.ts does the reading and writing.
 */
import { normalizeRpe } from '../domain/effort.ts';

/** A set as the backup file spells it. Every field is optional on the way in. */
export type JsonSet = {
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  done?: boolean;
  is_pr?: boolean;
  /** Effort as RPE. Absent from backups written before ratings existed. */
  rpe?: number | null;
};

/** A set as the store holds it. */
export type BackupSet = {
  type: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  isPr: boolean;
  rpe: number | null;
};

export function toJsonSet(s: BackupSet): Required<JsonSet> {
  return { type: s.type, weight_kg: s.weight, reps: s.reps, done: s.done, is_pr: s.isPr, rpe: s.rpe };
}

export function readJsonSet(ps: JsonSet): BackupSet {
  return {
    type: ps.type ?? 'normal',
    weight: ps.weight_kg ?? null,
    reps: ps.reps ?? null,
    done: ps.done !== false, // exported workouts are completed
    isPr: !!ps.is_pr,
    rpe: normalizeRpe(ps.rpe),
  };
}

/**
 * The workouts list of a JSON backup, or null when the file has none. Throws
 * on text that isn't JSON. Every other top-level key is read past, the
 * `profile` an export from a named profile carries included (#117): an import
 * always goes into the active profile, whoever the file came from.
 */
export function backupWorkouts(text: string): unknown[] | null {
  const data: unknown = JSON.parse(text);
  if (data === null || typeof data !== 'object') return null;
  const workouts = (data as { workouts?: unknown }).workouts;
  return Array.isArray(workouts) ? workouts : null;
}

/** A completed workout as the exporter reads it: stored names, stored values. */
export type BackupWorkout = {
  id: string;
  name: string;
  startedAt: number;
  endedAt: number | null;
  notes: string | null;
  durationSeconds: number;
  totalVolume: number;
  totalSets: number;
  prCount: number;
  exercises: {
    name: string;
    note: string | null;
    supersetGroup: number | null;
    sets: (BackupSet & { position: number })[];
  }[];
};

/**
 * The JSON backup's text. Names go out exactly as stored — never a display
 * label — so a backup reads the same whatever language the phone is in.
 */
export function toBackupJson(workouts: BackupWorkout[], profile: { name: string; initials: string }): string {
  return JSON.stringify({
    profile: { name: profile.name, initials: profile.initials },
    workouts: workouts.map((w) => ({
      id: w.id, name: w.name,
      started_at: new Date(w.startedAt).toISOString(),
      ended_at: w.endedAt === null ? null : new Date(w.endedAt).toISOString(),
      duration_seconds: w.durationSeconds, total_volume: w.totalVolume, total_sets: w.totalSets, pr_count: w.prCount,
      exercises: w.exercises.map((ex) => ({
        name: ex.name, note: ex.note, superset_group: ex.supersetGroup,
        sets: ex.sets.map(toJsonSet),
      })),
    })),
  });
}
