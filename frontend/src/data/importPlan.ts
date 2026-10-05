/**
 * Which of a file's workouts an import writes, and which exercises that
 * touches. Pure — no DB — so it is node-tested; exportRepo.ts does the writing.
 *
 * Both are decided before anything is written, because the touched exercises
 * have their PR flags re-derived across their whole history afterwards (#91),
 * and that needs each one's standing read while the history is still as it was.
 * So do the exercises of the workouts it skips as already stored.
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
   * no session.
   */
  exercises: string[];
  /**
   * The exercises named only by workouts skipped as already stored: in the
   * database from an earlier import, and in none of the workouts written now.
   * Once each, under its first spelling, and never one that is in `exercises`.
   *
   * They gain no session, but their flags are re-derived all the same, so
   * that importing a file again repairs history an earlier, interrupted
   * import stored without flags. They are looked up, never created.
   */
  storedExercises: string[];
};

/**
 * `seen` holds the keys of the workouts already stored. Re-importing the same
 * file, or a later overlapping one, must not duplicate history; a workout with
 * no key cannot be matched and is always written.
 *
 * A workout skipped as stored still reports its exercises (`storedExercises`),
 * so the import can re-derive their flags.
 */
export function planImport<T>(
  candidates: readonly ImportCandidate<T>[],
  seen: ReadonlySet<string>,
): ImportPlan<T> {
  const taken = new Set(seen);
  const accepted: T[] = [];
  const exercises = new Map<string, string>();
  const stored = new Map<string, string>();
  const note = (into: Map<string, string>, names: readonly string[]) => {
    for (const name of names) {
      const key = exerciseKey(name);
      if (key && !into.has(key)) into.set(key, name.trim());
    }
  };
  let duplicatesSkipped = 0;
  for (const c of candidates) {
    if (c.key !== null) {
      if (taken.has(c.key)) {
        duplicatesSkipped++;
        // Stored before this import, not merely listed twice by the file: a
        // second listing's exercises were never written with that workout.
        if (seen.has(c.key)) note(stored, c.exerciseNames);
        continue;
      }
      taken.add(c.key);
    }
    accepted.push(c.workout);
    note(exercises, c.exerciseNames);
  }
  for (const key of exercises.keys()) stored.delete(key);
  return {
    accepted,
    duplicatesSkipped,
    exercises: [...exercises.values()],
    storedExercises: [...stored.values()],
  };
}
