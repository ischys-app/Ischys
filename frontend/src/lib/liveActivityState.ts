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
 * Pure — no imports, so `node --test` can run it. The carry-forward rules are
 * injected as `resolve` rather than imported, keeping this file self-contained
 * (see setCarry.ts, which is tested separately). See liveActivityState.test.ts.
 */

export type LiveActivityMode = 'logging' | 'rest';

/** The card as it should look once the current set is completed. */
export type NextSet = {
  exerciseName: string;
  subtitle: string;
  weightLabel: string;
  repsLabel: string;
  setId?: string;
};

export type LiveActivitySnapshot = {
  exerciseName: string;
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
type ExerciseLike = { name: string; rest: number; sets: readonly SetLike[] };

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

/** An unlogged bodyweight set has no weight; show a dash rather than " kg". */
const weightLabelFor = (weight: string): string =>
  weight.trim() === '' ? '—' : `${weight.trim()} kg`;

const repsLabelFor = (reps: string): string =>
  reps.trim() === '' ? '—' : `${reps.trim()} reps`;

type Located = { ex: ExerciseLike; index: number };

/** First set that is neither done nor `treatAsDone`, scanning exercises in order. */
function locate(
  exercises: readonly ExerciseLike[],
  treatAsDone?: string,
): Located | null {
  for (const ex of exercises) {
    const index = ex.sets.findIndex((s) => !s.done && s.id !== treatAsDone);
    if (index !== -1) return { ex, index };
  }
  return null;
}

function describe(at: Located, resolve: Resolve): NextSet {
  const filled = resolve(at.ex.sets, at.index);
  const weightLabel = weightLabelFor(filled.weight);
  const repsLabel = repsLabelFor(filled.reps);
  return {
    exerciseName: at.ex.name,
    subtitle: `Next: set ${at.index + 1} of ${at.ex.sets.length} (${weightLabel} ${TIMES} ${repsLabel})`,
    weightLabel,
    repsLabel,
    setId: at.ex.sets[at.index].id,
  };
}

/**
 * `null` when every set is done — the card has nothing useful left to say, and
 * the caller ends the Activity rather than showing a stale set.
 */
export function buildLiveActivityState(
  exercises: readonly ExerciseLike[],
  resting: boolean,
  resolve: Resolve,
): LiveActivitySnapshot | null {
  const current = locate(exercises);
  if (!current) return null;

  const { ex, index } = current;
  const set = ex.sets[index];
  const filled = resolve(ex.sets, index);
  const weightLabel = weightLabelFor(filled.weight);
  const repsLabel = repsLabelFor(filled.reps);
  const position = `set ${index + 1} of ${ex.sets.length}`;

  const after = locate(exercises, set.id);

  return {
    exerciseName: ex.name,
    mode: resting ? 'rest' : 'logging',
    subtitle: resting ? `Next: ${position} (${weightLabel} ${TIMES} ${repsLabel})` : `Set ${index + 1} of ${ex.sets.length}`,
    weightLabel,
    repsLabel,
    setId: set.id,
    restSeconds: ex.rest,
    next: after ? describe(after, resolve) : undefined,
  };
}
