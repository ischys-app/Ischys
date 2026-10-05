/**
 * Serialises the active workout into the state the Watch mirrors.
 *
 * The phone is the source of truth (README: "set data, routine, and metrics are
 * pushed from the iPhone"). This builds the snapshot the Watch's `PhoneState`
 * decodes — the current set, the set-progress dots, and the session totals.
 *
 * Pure — the only imports are the shared look-ahead and the unit maths, so
 * `node --test` can run it. The carry-forward rule is injected as `resolve`
 * (see setCarry.ts), keeping this self-contained.
 */
import { type Unit, inputToKg, volumeToDisplay } from '../domain/units.ts';
import { locateNextSet } from './nextSet.ts';

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
type ExerciseLike = {
  name: string;
  equipment: string;
  rest: number;
  /** For a bodyweight movement, `weight` is added load and the mover's mass is added on top. */
  kind?: 'weighted' | 'bodyweight';
  /** Shared by paired exercises; null when the exercise stands alone. */
  supersetGroup?: number | null;
  sets: readonly SetLike[];
};

type Resolve = (
  sets: readonly SetLike[],
  index: number,
) => { weight: string; reps: string };

export type WatchState = {
  screen: 'session';
  /**
   * Epoch ms the *workout* began — the Watch's elapsed clock counts from this.
   * Its own `HKWorkoutSession` starts whenever the Watch app got going, which
   * can be seconds or minutes later, and counting from that made the two clocks
   * disagree (#32). 0 when the phone doesn't know it yet; the Watch then keeps
   * its session start rather than jumping to 1970.
   */
  startedAt: number;
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
  /**
   * Epoch ms the running rest ends, 0 when not resting. The Watch counts down to
   * this itself and buzzes when it passes: `restRemaining` only moves while the
   * phone's JS is running, which stops with the phone locked in a pocket (#82).
   */
  restEndsAt: number;
  /** The `rest_timer_alerts` setting. Off means the wrist stays quiet too. */
  restAlerts: boolean;
  nextSetLabel: string;
  /**
   * The unit `weight`, `prevWeight` and `volume` are expressed in. The Watch
   * labels with it, steps the Crown by it, and sends the logged weight back in
   * it — the phone converts to kilograms on receipt.
   */
  unit: Unit;
  /** Session volume, whole, already in `unit`. */
  volume: number;
  setsDone: number;
  setsTotal: number;
  /**
   * "SUPERSET A · 1 OF 2" when the current exercise is paired, else ''. The
   * wrist needs to know it is mid-round, or resting looks broken when no timer
   * starts after a set.
   */
  supersetLabel: string;
  /** Accent palette id, so the wrist matches the phone (#72). */
  themeId?: string;
  /** The workout-exercise id and set id the Watch's Log Set acts on. */
  currentExerciseId: string;
  currentSetId: string;
};

/** What the caller knows about the rest timer. */
export type WatchRest = {
  resting: boolean;
  remaining: number;
  total: number;
  /** Epoch ms the rest ends; null or omitted when unknown or not resting. */
  endsAt?: number | null;
  /** The user's `rest_timer_alerts` setting; omitted reads as off. */
  alerts?: boolean;
};

/**
 * The end date the Watch may act on, or 0 for none. Only a running rest has
 * one: an end date left over beside `resting: false` would let the wrist buzz
 * for a rest that was skipped, so it is dropped here rather than trusted there.
 */
export function watchRestEndsAt(rest: WatchRest): number {
  if (!rest.resting || rest.remaining <= 0) return 0;
  return rest.endsAt != null && rest.endsAt > 0 ? rest.endsAt : 0;
}

/** Session totals: volume + set counts over done sets. Warmups are excluded from
 *  volume unless `countWarmups`, but never from the set count (matching the
 *  domain: only VOLUME counts warmups). A bodyweight movement counts
 *  (bodyweight + added) × reps; 0 bodyweight means it adds 0.
 *
 *  Summed in kilograms — each typed weight is converted from `unit` first, so
 *  it can be added to the (always-kg) bodyweight — and converted to `unit` once
 *  at the end, the same way the phone's header does it. */
function totals(
  exercises: readonly (ExerciseLike & { id: string })[],
  bodyweightKg: number,
  countWarmups: boolean,
  unit: Unit,
) {
  let volumeKg = 0;
  let setsDone = 0;
  let setsTotal = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      setsTotal += 1;
      // Every logged set counts, warmups included. `setsTotal` counts them too,
      // and the Watch derives "nothing left to log" from `setsDone >= setsTotal`
      // — so excluding warmups here made that unreachable for any workout with a
      // warmup set, and the Watch's end-of-workout screen could never appear.
      // Counting both sides the same way also matches `locateNextSet`, which the
      // phone, the Lock Screen and the Watch are all supposed to agree on.
      if (s.done) {
        setsDone += 1;
      }
      if (s.done && (s.type !== 'warmup' || countWarmups)) {
        const reps = parseFloat(s.reps) || 0;
        const added = inputToKg(s.weight, unit) ?? 0;
        if (ex.kind === 'bodyweight') {
          const load = bodyweightKg + added;
          if (load > 0) volumeKg += load * reps;
        } else {
          volumeKg += added * reps;
        }
      }
    }
  }
  return { volume: Math.round(volumeToDisplay(volumeKg, unit)), setsDone, setsTotal };
}

/**
 * The state to push once every planned set is logged, so the Watch can show its
 * end-of-workout screen (it derives that from `setsDone >= setsTotal`).
 *
 * Without this the phone simply stopped pushing when `buildWatchState` returned
 * null, so the Watch kept the last mid-workout snapshot and never learned the
 * workout was finishable — logging the final set on the phone appeared to do
 * nothing on the wrist.
 *
 * The set fields describe the last set logged; the Watch's end state reads only
 * the totals, but they must stay well-formed for the shared decoder.
 */

/**
 * "SUPERSET A · 1 OF 2" for a paired exercise, or '' when it stands alone.
 *
 * The letter is by order of first appearance, matching the phone. The wrist
 * needs this: inside a superset no rest timer starts between partners, and
 * without a label that reads as the timer being broken rather than as the
 * round still being in progress.
 */
function supersetLabelFor(
  exercises: readonly (ExerciseLike & { id: string })[],
  current: (ExerciseLike & { id: string }) | undefined,
): string {
  if (!current || current.supersetGroup == null) return '';
  const groups: number[] = [];
  for (const e of exercises) {
    if (e.supersetGroup != null && !groups.includes(e.supersetGroup)) groups.push(e.supersetGroup);
  }
  const letter = String.fromCharCode(65 + groups.indexOf(current.supersetGroup));
  const partners = exercises.filter((e) => e.supersetGroup === current.supersetGroup);
  const idx = partners.findIndex((e) => e.id === current.id) + 1;
  return `SUPERSET ${letter} · ${idx} OF ${partners.length}`;
}

export function buildFinishedWatchState(
  exercises: readonly (ExerciseLike & { id: string })[],
  routineName: string,
  startedAt: number | null = null,
  bodyweightKg = 0,
  countWarmups = false,
  /** The unit the set strings are in. */
  unit: Unit = 'kg',
  /** The `rest_timer_alerts` setting, so every push agrees on it. */
  restAlerts = false,
): WatchState | null {
  const withSets = exercises.filter((e) => e.sets.length > 0);
  const last = withSets[withSets.length - 1];
  if (!last) return null;
  const lastSet = last.sets[last.sets.length - 1];
  const t = totals(exercises, bodyweightKg, countWarmups, unit);

  return {
    screen: 'session',
    startedAt: startedAt ?? 0,
    routineName,
    exerciseName: last.name,
    equipment: last.equipment,
    supersetLabel: supersetLabelFor(exercises, last),
    setNum: last.sets.length,
    setCount: last.sets.length,
    weight: lastSet.weight,
    reps: lastSet.reps,
    prevWeight: lastSet.prevWeight ?? '',
    prevReps: lastSet.prevReps ?? '',
    setDots: last.sets.map(() => 'done' as WatchSetDot),
    resting: false,
    restRemaining: 0,
    restTotal: 0,
    restEndsAt: 0,
    restAlerts,
    nextSetLabel: '',
    unit,
    volume: t.volume,
    setsDone: t.setsDone,
    setsTotal: t.setsTotal,
    currentExerciseId: last.id,
    currentSetId: lastSet.id,
  };
}

/**
 * The state to push, or null when there is no active set (every set done) — the
 * caller then pushes `buildFinishedWatchState` instead.
 */
export function buildWatchState(
  exercises: readonly (ExerciseLike & { id: string })[],
  routineName: string,
  rest: WatchRest,
  resolve: Resolve,
  /** Epoch ms the workout began; omit (or null) before it is known. */
  startedAt: number | null = null,
  /** Current bodyweight (kg) for bodyweight-movement volume; 0 = unknown. */
  bodyweightKg = 0,
  /** Whether warmup sets count toward the live volume; default off. */
  countWarmups = false,
  /** The unit the set strings are in; the Watch labels and steps by it. */
  unit: Unit = 'kg',
): WatchState | null {
  const current = locateNextSet(exercises);
  if (!current) return null;

  const { exercise: ex, setIndex: index } = current;
  const set = ex.sets[index];
  const filled = resolve(ex.sets, index);

  const setDots: WatchSetDot[] = ex.sets.map((s, i) =>
    s.done ? 'done' : i === index ? 'active' : 'pending',
  );

  const t = totals(exercises, bodyweightKg, countWarmups, unit);

  return {
    screen: 'session',
    startedAt: startedAt ?? 0,
    routineName,
    exerciseName: ex.name,
    equipment: ex.equipment,
    supersetLabel: supersetLabelFor(exercises, ex as ExerciseLike & { id: string }),
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
    restEndsAt: watchRestEndsAt(rest),
    restAlerts: rest.alerts === true,
    // The Watch's Rest screen shows only this line, so it must describe the set
    // the rest is *for* — which is the located set: during rest the set just
    // completed is already `done`, so the look-ahead has moved on (crossing into
    // the next exercise when the last set of one is finished). The old
    // `Math.min(index + 2, ex.sets.length)` looked one set too far and then
    // clamped inside the current exercise, so the final set of an exercise
    // showed its own number back as "next".
    nextSetLabel: `Next: Set ${index + 1} of ${ex.sets.length}`,
    unit,
    volume: t.volume,
    setsDone: t.setsDone,
    setsTotal: t.setsTotal,
    currentExerciseId: ex.id,
    currentSetId: set.id,
  };
}
