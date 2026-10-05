/**
 * What to put on the bar next (#69).
 *
 * A suggestion, never a write. It is computed when a set row renders and
 * nothing is stored, so ✓ logs exactly what is in the inputs — the moment this
 * became a default that ✓ could commit, it would be deciding the user's
 * training for them.
 *
 * It also never goes down on its own. Backing off is a decision the deload
 * advisory (#70) asks for explicitly and the user accepts; this module only
 * reflects that once it is already active.
 */

// DELOAD_FACTOR is imported, not redeclared: the advisory decides what a
// deload IS, and two copies of 0.9 would drift the moment one was tuned.
import { DELOAD_FACTOR } from './deload.ts';

export type ProgressionKind = 'up' | 'hold' | 'down';

export type Suggestion = {
  kind: ProgressionKind;
  weight: number;
  reps: number;
};

type Input = {
  /** Catalog equipment: barbell | dumbbell | machine | cable | bodyweight | … */
  equipment: string;
  kind: 'weighted' | 'bodyweight';
  /** Set type — warm-ups and drop sets are not progressed. */
  setType: string;
  /**
   * The matching set last time, or null on a first session. `weight` is in the
   * user's unit, and so is the suggestion that comes back: this module rounds
   * to the steps below and never converts, so a lb user is offered 230 after
   * 225 rather than the pound-equivalent of a kilogram plate.
   */
  last: { weight: number | null; reps: number | null } | null;
  /** When that session was. */
  lastSessionAt: number | null;
  /** `routine_sets.target_reps`, or null when the workout has no routine. */
  targetReps: number | null;
  /**
   * Smallest weight change this gym can make on a bar — the smallest plate
   * pair, from the user's plate settings. Guessing a fixed 2.5 would propose
   * weights they cannot load. In the same unit as `last.weight`.
   */
  step: number;
  /**
   * The jump to the next dumbbell, in the same unit as `last.weight`. Defaults
   * to the metric rack; pass `WEIGHT_STEPS[unit].dumbbell` (domain/units.ts).
   */
  dumbbellStep?: number;
  now: number;
  /** True while a deload accepted from #70 is running. */
  deloadActive?: boolean;
};

/**
 * Beyond this, last time says too little to build on — a lift you haven't
 * touched in two months is a restart, not a progression.
 */
const STALE_AFTER_DAYS = 56;

/** Dumbbells move to the next common size; the user's rack is unknown. */
const DUMBBELL_STEP_KG = 2;

/** Equipment whose weight increments we cannot know, so we add a rep instead. */
const UNREADABLE_STACK = new Set(['machine', 'cable']);

const round = (weight: number, step: number): number =>
  step > 0 ? Math.round(weight / step) * step : Math.round(weight);

export function suggestNextSet({
  equipment,
  kind,
  setType,
  last,
  lastSessionAt,
  targetReps,
  step: barStep,
  dumbbellStep = DUMBBELL_STEP_KG,
  now,
  deloadActive = false,
}: Input): Suggestion | null {
  // Warm-ups ramp to the work set and drop sets are defined by dropping — a
  // progression on either would be arguing with the point of the set.
  if (setType === 'warmup' || setType === 'drop') return null;
  if (!last || last.reps == null || last.weight == null) return null;
  if (lastSessionAt == null) return null;
  if ((now - lastSessionAt) / 86400000 > STALE_AFTER_DAYS) return null;

  const lastWeight = last.weight;
  const lastReps = last.reps;

  if (deloadActive) {
    return { kind: 'down', weight: round(lastWeight * DELOAD_FACTOR, barStep), reps: lastReps };
  }

  // "Reached" is the routine's target, or simply matching last time when there
  // is no routine. schema.ts has no rep-range field, so this cannot be "top of
  // the range" however much that would suit the usual programming advice.
  const target = targetReps ?? lastReps;
  const reached = lastReps >= target;

  if (!reached) {
    // Hold the weight and ask for one more rep, capped at the target. Never
    // down: two bad sessions in a row are the deload advisory's business.
    return { kind: 'hold', weight: lastWeight, reps: Math.min(target, lastReps + 1) };
  }

  // A weighted movement on equipment we can read moves in weight; everything
  // else moves in reps, because inventing a stack increment would propose a
  // weight the machine cannot make.
  const addsReps = kind === 'bodyweight' || UNREADABLE_STACK.has(equipment);
  if (addsReps) return { kind: 'up', weight: lastWeight, reps: lastReps + 1 };

  const step = equipment === 'dumbbell' ? dumbbellStep : barStep;
  return { kind: 'up', weight: round(lastWeight + step, step), reps: target };
}
