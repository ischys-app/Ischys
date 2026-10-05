/**
 * The strings the Lock Screen card shows, derived from workout state.
 *
 * Both labels come from the *next unfinished* set. During rest that set is the
 * one you are about to do (the set you just completed is already `done`), which
 * is why the same lookup serves both modes — only the phrasing differs.
 *
 * The snapshot also carries `restSeconds` and `next`: everything the card's ✓
 * button needs to redraw itself into the rest state without waiting for JS to
 * wake up and push. JS still owns the write; this is only so the card responds
 * to a tap on a locked phone.
 *
 * Pure — the only imports are the shared look-ahead and the artwork lookup, both
 * plain data, so `node --test` can run it. The carry-forward rules are injected
 * as `resolve` rather than imported, keeping this file self-contained (see
 * setCarry.ts, which is tested separately). See liveActivityState.test.ts.
 */
import type { Unit } from '../domain/units.ts';
import { exerciseArtSlug } from './exerciseArt.ts';
import { locateNextSet } from './nextSet.ts';

export type LiveActivityMode = 'logging' | 'rest';

/** The card as it should look once the current set is completed. */
export type NextSet = {
  exerciseName: string;
  /** See `LiveActivitySnapshot.artSlug`. */
  artSlug?: string;
  subtitle: string;
  weightLabel: string;
  repsLabel: string;
  setId?: string;
};

export type LiveActivitySnapshot = {
  exerciseName: string;
  /**
   * Names the exercise's line art in the widget's own asset catalog, or absent
   * where we have none — the card then draws the initials monogram. The widget
   * is a separate process and cannot read the bundled path data, so it carries
   * the same art as images and only this key crosses over.
   */
  artSlug?: string;
  mode: LiveActivityMode;
  subtitle: string;
  weightLabel: string;
  repsLabel: string;
  setId: string;
  /** Rest to start when the current set is completed. */
  restSeconds: number;
  /** Absent on the workout's very last set. */
  next?: NextSet;
};

type SetLike = { id: string; weight: string; reps: string; done: boolean };
type ExerciseLike = {
  name: string;
  rest: number;
  sets: readonly SetLike[];
  /** Optional: only used to look up artwork, and coverage is partial anyway. */
  exerciseCatalogId?: string;
};

/**
 * Fills in what a set would log if completed untouched — the caller supplies
 * `carryFor`/`resolveSet` from setCarry.ts.
 */
type Resolve = (
  sets: readonly SetLike[],
  index: number,
) => { weight: string; reps: string };

/** U+00D7, matching the design. Not the ASCII letter x. */
const TIMES = '×';

/**
 * An unlogged bodyweight set has no weight; show a dash rather than a bare unit.
 * The weight string is already in the user's unit — this only names it.
 */
const weightLabelFor = (weight: string, unit: Unit): string =>
  weight.trim() === '' ? '—' : `${weight.trim()} ${unit}`;

const repsLabelFor = (reps: string): string =>
  reps.trim() === '' ? '—' : `${reps.trim()} reps`;

type Located = { exercise: ExerciseLike; setIndex: number };

function describe(at: Located, resolve: Resolve, unit: Unit): NextSet {
  const { exercise, setIndex } = at;
  const filled = resolve(exercise.sets, setIndex);
  const weightLabel = weightLabelFor(filled.weight, unit);
  const repsLabel = repsLabelFor(filled.reps);
  return {
    exerciseName: exercise.name,
    artSlug: exerciseArtSlug(exercise.exerciseCatalogId),
    subtitle: `Next: set ${setIndex + 1} of ${exercise.sets.length} (${weightLabel} ${TIMES} ${repsLabel})`,
    weightLabel,
    repsLabel,
    setId: exercise.sets[setIndex].id,
  };
}

/**
 * `null` when every set is done — the card has nothing useful left to say, and
 * the caller ends the Activity rather than showing a stale set.
 *
 * `unit` is the unit the set strings are expressed in. Required, not defaulted:
 * the widget prints these labels verbatim, so a forgotten argument would put
 * "kg" next to a number of pounds on the Lock Screen.
 */
export function buildLiveActivityState(
  exercises: readonly ExerciseLike[],
  resting: boolean,
  resolve: Resolve,
  unit: Unit,
): LiveActivitySnapshot | null {
  const current = locateNextSet(exercises);
  if (!current) return null;

  const { exercise: ex, setIndex: index } = current;
  const set = ex.sets[index];
  const filled = resolve(ex.sets, index);
  const weightLabel = weightLabelFor(filled.weight, unit);
  const repsLabel = repsLabelFor(filled.reps);
  const position = `set ${index + 1} of ${ex.sets.length}`;

  const after = locateNextSet(exercises, set.id);

  return {
    exerciseName: ex.name,
    artSlug: exerciseArtSlug(ex.exerciseCatalogId),
    mode: resting ? 'rest' : 'logging',
    subtitle: resting ? `Next: ${position} (${weightLabel} ${TIMES} ${repsLabel})` : `Set ${index + 1} of ${ex.sets.length}`,
    weightLabel,
    repsLabel,
    setId: set.id,
    restSeconds: ex.rest,
    next: after ? describe(after, resolve, unit) : undefined,
  };
}
