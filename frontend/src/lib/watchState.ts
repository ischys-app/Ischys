/**
 * Serialises the active workout into the state the Watch mirrors.
 *
 * The phone is the source of truth (README: "set data, routine, and metrics are
 * pushed from the iPhone"). This builds the snapshot the Watch's `PhoneState`
 * decodes — the current set, the set-progress dots, and the session totals.
 *
 * Pure — no imports, so `node --test` can run it. The carry-forward rule is
 * injected as `resolve` (see setCarry.ts), keeping this self-contained.
 */

export type WatchSetDot = 'done' | 'active' | 'pending';

type SetLike = {
  id: string;
  type: string;
  weight: string;
  reps: string;
  prevWeight?: string;
  prevReps?: string;
  done: boolean;
};
type ExerciseLike = { name: string; equipment: string; rest: number; sets: readonly SetLike[] };

type Resolve = (
  sets: readonly SetLike[],
  index: number,
) => { weight: string; reps: string };

export type WatchState = {
  screen: 'session';
  routineName: string;
  exerciseName: string;
  equipment: string;
  setNum: number;
  setCount: number;
  weight: string;
  reps: string;
  prevWeight: string;
  prevReps: string;
  setDots: WatchSetDot[];
  resting: boolean;
  restRemaining: number;
  restTotal: number;
  nextSetLabel: string;
  volumeKg: number;
  setsDone: number;
  setsTotal: number;
  /** The workout-exercise id and set id the Watch's Log Set acts on. */
  currentExerciseId: string;
  currentSetId: string;
};

type Located = { ex: ExerciseLike & { id: string }; index: number };

function locate(exercises: readonly (ExerciseLike & { id: string })[]): Located | null {
  for (const ex of exercises) {
    const index = ex.sets.findIndex((s) => !s.done);
    if (index !== -1) return { ex, index };
  }
  return null;
}

/** Session totals: volume + set counts over done, non-warmup sets. */
function totals(exercises: readonly (ExerciseLike & { id: string })[]) {
  let volumeKg = 0;
  let setsDone = 0;
  let setsTotal = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      setsTotal += 1;
      if (s.done && s.type !== 'warmup') {
        volumeKg += (parseFloat(s.weight) || 0) * (parseFloat(s.reps) || 0);
        setsDone += 1;
      }
    }
  }
  return { volumeKg: Math.round(volumeKg), setsDone, setsTotal };
}

/**
 * The state to push, or null when there is no active set (every set done) — the
 * caller then pushes a summary/idle state instead.
 */
export function buildWatchState(
  exercises: readonly (ExerciseLike & { id: string })[],
  routineName: string,
  rest: { resting: boolean; remaining: number; total: number },
  resolve: Resolve,
): WatchState | null {
  const current = locate(exercises);
  if (!current) return null;

  const { ex, index } = current;
  const set = ex.sets[index];
  const filled = resolve(ex.sets, index);

  const setDots: WatchSetDot[] = ex.sets.map((s, i) =>
    s.done ? 'done' : i === index ? 'active' : 'pending',
  );

  const t = totals(exercises);

  return {
    screen: 'session',
    routineName,
    exerciseName: ex.name,
    equipment: ex.equipment,
    setNum: index + 1,
    setCount: ex.sets.length,
    weight: filled.weight,
    reps: filled.reps,
    prevWeight: set.prevWeight ?? '',
    prevReps: set.prevReps ?? '',
    setDots,
    resting: rest.resting,
    restRemaining: rest.remaining,
    restTotal: rest.total,
    nextSetLabel: `Next: Set ${Math.min(index + 2, ex.sets.length)}`,
    volumeKg: t.volumeKg,
    setsDone: t.setsDone,
    setsTotal: t.setsTotal,
    currentExerciseId: ex.id,
    currentSetId: set.id,
  };
}
