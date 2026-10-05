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
