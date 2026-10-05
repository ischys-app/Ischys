/**
 * Which of a file's workouts an import writes, and which exercises that
 * touches. Pure — no DB — so it is node-tested; exportRepo.ts does the writing.
 *
 * Both are decided before anything is written, because the touched exercises
 * have their PR flags re-derived across their whole history afterwards (#91),
 * and that needs each one's standing read while the history is still as it was.
 */

/** A completed workout's identity: the same name at the same instant is the same workout. */
export const workoutKey = (name: string, startedAt: number): string => `${name}@@${startedAt}`;

/** An exercise's identity by name: case and surrounding space do not make a new one. */
export const exerciseKey = (name: string): string => name.trim().toLowerCase();

export type ImportCandidate<T> = {
  workout: T;
  /** `workoutKey`, or null when the file gave no start to key on. */
  key: string | null;
  /** The exercises it lists, as the file spells them. */
  exerciseNames: readonly string[];
};

export type ImportPlan<T> = {
  /** The workouts to write, in file order. */
  accepted: T[];
  /** How many were left out as already stored, or listed twice. */
  duplicatesSkipped: number;
  /**
   * Every exercise the accepted workouts name, once each, under its first
   * spelling. An exercise only a skipped workout names is not here: it gains
   * no session, so nothing about its records moves.
   */
  exercises: string[];
};

/**
 * `seen` holds the keys of the workouts already stored. Re-importing the same
 * file, or a later overlapping one, must not duplicate history; a workout with
 * no key cannot be matched and is always written.
 */
export function planImport<T>(
  candidates: readonly ImportCandidate<T>[],
  seen: ReadonlySet<string>,
): ImportPlan<T> {
  const taken = new Set(seen);
  const accepted: T[] = [];
  const exercises = new Map<string, string>();
  let duplicatesSkipped = 0;
  for (const c of candidates) {
    if (c.key !== null) {
      if (taken.has(c.key)) {
        duplicatesSkipped++;
        continue;
      }
      taken.add(c.key);
    }
    accepted.push(c.workout);
    for (const name of c.exerciseNames) {
      const key = exerciseKey(name);
      if (key && !exercises.has(key)) exercises.set(key, name.trim());
    }
  }
  return { accepted, duplicatesSkipped, exercises: [...exercises.values()] };
}
