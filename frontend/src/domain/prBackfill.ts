/**
 * The whole-database PR flag pass (#91): which sets are records, and how many
 * PRs each workout holds, decided for every exercise at once.
 *
 * `is_pr` and `pr_count` are written when a workout is finished. History that
 * arrived by import was never finished, so it carried neither — until an edit
 * re-walked the exercises it touched and left the rest bare. This is the same
 * walk (`walkPrFlags`) run over everything, once, so the two agree.
 *
 * Pure: it is handed the stored sets and returns what to write. The reading
 * and writing are data/prBackfill.ts.
 */
import { walkPrFlags, type PRSession, type PRSet } from './records.ts';

/**
 * Which pass this build runs. The version that last completed is stored on the
 * device; raise this to have a corrected pass run once more for everyone.
 */
export const PR_BACKFILL_VERSION = 1;

export type PrBackfillDecision =
  /** This version, or a later one, has already run here. */
  | 'skip'
  /** Never run, and no history to run over: record it as done. */
  | 'mark'
  | 'run';

/**
 * Whether the pass is owed. `stored` is the marker as read, null when absent.
 *
 * An empty database is marked without running: from here on a finish flags its
 * own workout and an import derives its own flags, so nothing that reaches the
 * database later can need this pass.
 */
export function decidePrBackfill(
  stored: string | null,
  completedWorkouts: number,
  version: number = PR_BACKFILL_VERSION,
): PrBackfillDecision {
  const ran = stored ? Number(stored) : 0;
  if (Number.isFinite(ran) && ran >= version) return 'skip';
  return completedWorkouts > 0 ? 'run' : 'mark';
}

/** One set of a completed workout, with what places it in its exercise's history. */
export type PrSetRow = {
  setId: string;
  workoutId: string;
  exerciseId: string;
  /** The workout's start: where the session sits in the exercise's history. */
  startedAt: number;
  /** The workout's bodyweight snapshot (kg); null when it has none. */
  bodyweightKg: number | null;
  /** The exercise's place in the workout, then the set's place in the exercise. */
  exercisePosition: number;
  position: number;
  type: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  /** The flag as stored. */
  isPr: boolean;
};

type Kind = 'weighted' | 'bodyweight';

/**
 * Stored sets, grouped into each exercise's sessions as the walk reads them.
 *
 * A session is one workout's sets of the exercise, however many times the
 * workout lists it. Sessions are ordered oldest first, and by id where two
 * share an instant; sets in workout order. Both are fixed so the pass decides
 * a tie the same way every time it is run.
 *
 * A bodyweight movement counts the mass its workout recorded, else today's
 * (`currentBw`), else none — as the records do everywhere else.
 */
export function prHistories(
  rows: readonly PrSetRow[],
  kinds: ReadonlyMap<string, Kind>,
  currentBw: number | null,
): Map<string, PRSession[]> {
  const ordered = rows
    .slice()
    .sort((a, b) => a.exercisePosition - b.exercisePosition || a.position - b.position || (a.setId < b.setId ? -1 : 1));
  const byExercise = new Map<string, Map<string, PRSession>>();
  for (const r of ordered) {
    let sessions = byExercise.get(r.exerciseId);
    if (!sessions) byExercise.set(r.exerciseId, (sessions = new Map()));
    let session = sessions.get(r.workoutId);
    if (!session) {
      session = {
        id: r.workoutId,
        achievedAt: r.startedAt,
        bodyweightKg: r.bodyweightKg ?? currentBw ?? 0,
        sets: [],
      };
      sessions.set(r.workoutId, session);
    }
    const set: PRSet = {
      id: r.setId,
      type: r.type,
      weight: r.weight,
      reps: r.reps,
      done: r.done,
      kind: kinds.get(r.exerciseId) ?? 'weighted',
    };
    session.sets.push(set);
  }
  const out = new Map<string, PRSession[]>();
  for (const [exerciseId, sessions] of byExercise) {
    out.set(
      exerciseId,
      [...sessions.values()].sort((a, b) => a.achievedAt - b.achievedAt || (a.id < b.id ? -1 : 1)),
    );
  }
  return out;
}

export type PrBackfillPlan = {
  /** Sets to flag, and sets to unflag. */
  raise: string[];
  lower: string[];
  /** The workouts whose stored count is wrong, with the count they should hold. */
  prCounts: Map<string, number>;
};

/**
 * What the pass writes: only the flags and counts that differ from the walk.
 *
 * Counts are rebuilt, not adjusted. A workout's count is the number of its
 * exercises that set a record there — what finish stores — and with every
 * exercise walked that number is simply known. Moving a stored count by one
 * per exercise, as an edit does for the exercises it touches, is only as right
 * as the count it starts from, and cannot tell a volume record (which flags no
 * set) from one that was never counted. See prBackfill.test.ts.
 *
 * `prCounts` is every completed workout's stored count. A workout that no row
 * mentions has no sets, set no record, and counts zero.
 */
export function planPrBackfill(input: {
  rows: readonly PrSetRow[];
  prCounts: ReadonlyMap<string, number>;
  kinds: ReadonlyMap<string, Kind>;
  currentBw: number | null;
  countWarmups: boolean;
}): PrBackfillPlan {
  const walked = newPrWalkTally();
  for (const sessions of prHistories(input.rows, input.kinds, input.currentBw).values()) {
    tallyPrWalk(walked, sessions, input.countWarmups);
  }
  return diffPrState(input.rows, input.prCounts, walked);
}

/**
 * The count each of `workoutIds` should hold, rebuilt from the walk: the
 * number of its exercises that set a record there. Zero for a workout no row
 * mentions.
 *
 * For a change that `reflagExercisePrs`' one-step adjustment cannot express.
 * Merging two exercises is one: a workout that logged both counted each, so
 * its count may have to fall by two, or by one while the merged exercise goes
 * on holding a record there — and a count is a bare number that cannot say
 * which of its PRs were theirs. See the merge tests in prBackfill.test.ts.
 *
 * `rows` must hold the whole completed history of every exercise those
 * workouts list; other exercises' rows are walked and ignored.
 */
export function rebuiltPrCounts(
  input: {
    rows: readonly PrSetRow[];
    kinds: ReadonlyMap<string, Kind>;
    currentBw: number | null;
    countWarmups: boolean;
  },
  workoutIds: Iterable<string>,
): Map<string, number> {
  const walked = newPrWalkTally();
  for (const sessions of prHistories(input.rows, input.kinds, input.currentBw).values()) {
    tallyPrWalk(walked, sessions, input.countWarmups);
  }
  const out = new Map<string, number>();
  for (const workoutId of workoutIds) out.set(workoutId, walked.counts.get(workoutId) ?? 0);
  return out;
}

/**
 * What the walks have decided so far: the sets that are records, and how many
 * exercises set one in each workout.
 *
 * `planPrBackfill` in three steps — group (`prHistories`), walk each exercise
 * into a tally (`tallyPrWalk`), compare with what is stored (`diffPrState`) —
 * so that the caller on the device can hand the JS thread back between them
 * rather than plan a whole database in one stretch.
 */
export type PrWalkTally = { flagged: Set<string>; counts: Map<string, number> };

export const newPrWalkTally = (): PrWalkTally => ({ flagged: new Set(), counts: new Map() });

/** Walks one exercise's sessions into the tally. */
export function tallyPrWalk(tally: PrWalkTally, sessions: readonly PRSession[], countWarmups: boolean): void {
  for (const step of walkPrFlags(sessions, countWarmups)) {
    for (const id of step.flaggedSetIds) tally.flagged.add(id);
    if (step.deltas.length > 0) tally.counts.set(step.sessionId, (tally.counts.get(step.sessionId) ?? 0) + 1);
  }
}

/** The flags and counts that differ from a finished tally: what is left to write. */
export function diffPrState(
  rows: readonly PrSetRow[],
  storedCounts: ReadonlyMap<string, number>,
  walked: PrWalkTally,
): PrBackfillPlan {
  const raise: string[] = [];
  const lower: string[] = [];
  for (const r of rows) {
    if (r.isPr === walked.flagged.has(r.setId)) continue;
    (r.isPr ? lower : raise).push(r.setId);
  }

  const prCounts = new Map<string, number>();
  for (const [workoutId, stored] of storedCounts) {
    const count = walked.counts.get(workoutId) ?? 0;
    if (count !== stored) prCounts.set(workoutId, count);
  }
  // A workout with sets that the counts never listed: it has no stored count
  // to compare, so it is written.
  for (const [workoutId, count] of walked.counts) {
    if (!storedCounts.has(workoutId)) prCounts.set(workoutId, count);
  }
  return { raise, lower, prCounts };
}
