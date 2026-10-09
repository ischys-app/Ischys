/**
 * Pure volume & strength math — ported from the original server implementation.
 *
 * Rules (from the Ischys Design System):
 * - Warmup sets are **excluded** from volume and working-set counts.
 * - Volume is measured in kilograms. A weighted set contributes `weight × reps`.
 *   A bodyweight set contributes `(bodyweight + added) × reps` when a bodyweight
 *   is known, else 0 — so nothing changes until the user sets their bodyweight.
 * - Only **completed** (`done`) sets count toward a finished workout's stats.
 *
 * No imports beyond `import type` so `node --test` type-stripping can run it.
 */

/**
 * A set's shape for stats. `type` is the set-type string (e.g. 'normal',
 * 'warmup'). `kind` is the movement kind: for `'bodyweight'`, `weight` is the
 * *added* load (null = none, negative = assisted) and the mover's bodyweight is
 * added on top; absent/`'weighted'` uses `weight` directly.
 */
export type SetLike = {
  type: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  kind?: 'weighted' | 'bodyweight';
};

// The original used banker's rounding, but these values never land on a .5
// tie, so half-away-from-zero matches its numeric outputs exactly.
const round2 = (x: number): number => Math.round(x * 100) / 100;
const round1 = (x: number): number => Math.round(x * 10) / 10;

/**
 * Epley one-rep-max estimate: `weight * (1 + reps/30)`.
 *
 * Returns `null` when weight or reps are missing/non-positive.
 */
export function estimated1rm(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || reps <= 0) return null;
  if (reps === 1) return round2(weight);
  return round2(weight * (1 + reps / 30));
}

/**
 * Most reps a set may carry and still be trusted as a 1RM estimate.
 *
 * Epley is linear in reps, so it keeps rewarding volume long after it stops
 * predicting a single: 80 kg x 12 scores 112 and beats 100 kg x 3 at 110. Any
 * metric that ranks sets against each other has to cap this, or a back-off set
 * outranks the top single and a set of twenty outranks everything.
 *
 * Deliberately NOT applied inside `estimated1rm`. A calculator asked directly
 * for 15 reps should answer and say the answer is rough; it is ranking that
 * must not consider the set at all. Kept in step with `domain/records.ts`.
 */
export const EST_1RM_MAX_REPS = 10;

/**
 * Kilograms of volume for a single set. `bodyweightKg` is the mover's mass used
 * for bodyweight movements (0 = unknown → they contribute nothing).
 *
 * Zero for warmups (unless `countWarmups` is true), incomplete sets, or sets
 * missing reps (or, for weighted sets, missing weight).
 */
export function setVolume(s: SetLike, bodyweightKg = 0, countWarmups = false): number {
  if (!s.done || s.reps === null) return 0;
  if (s.type === 'warmup' && !countWarmups) return 0;
  if (s.kind === 'bodyweight') {
    // (bodyweight + added) × reps. A non-positive total load — no bodyweight set
    // and/or an assist that cancels it — contributes nothing.
    const load = bodyweightKg + (s.weight ?? 0);
    return load > 0 ? load * s.reps : 0;
  }
  if (s.weight === null) return 0;
  return s.weight * s.reps;
}

const isWorking = (s: SetLike): boolean => s.done && s.type !== 'warmup';

/** Total kg volume across completed sets (warmups excluded unless `countWarmups`). */
export function workoutVolume(sets: SetLike[], bodyweightKg = 0, countWarmups = false): number {
  return sets.reduce((total, s) => total + setVolume(s, bodyweightKg, countWarmups), 0);
}

/** Number of completed, non-warmup sets (the 'SETS' stat). */
export function countWorkingSets(sets: SetLike[]): number {
  return sets.reduce((n, s) => (isWorking(s) ? n + 1 : n), 0);
}

/**
 * One data point for a per-exercise chart: a session's value for `metric`.
 *
 * Working sets only (warmups excluded), matching the PR definitions so the
 * chart and the record cards agree:
 * - `best_set`    — heaviest working set's weight
 * - `est_1rm`     — max Epley 1RM across working sets
 * - `best_volume` — total working volume for the session
 * - `max_reps`    — most reps in a working set (bodyweight allowed)
 *
 * Returns `null` when the session has nothing to plot for that metric
 * (e.g. bodyweight-only sets for a weight metric), so the caller drops it.
 * An unknown metric falls back to `est_1rm`.
 */
export function sessionMetric(
  sets: SetLike[],
  metric: string,
  bodyweightKg = 0,
  countWarmups = false,
): number | null {
  // best_volume sums over volume-eligible sets (done && (not warmup || countWarmups)) —
  // setVolume already returns 0 for the rest — so it isn't gated on there being a
  // working set: a warmup-only session still has volume when countWarmups is on.
  if (metric === 'best_volume') {
    const vol = sets.reduce((total, s) => total + setVolume(s, bodyweightKg, countWarmups), 0);
    return vol > 0 ? round1(vol) : null;
  }

  const working = sets.filter(isWorking);
  if (working.length === 0) return null;

  if (metric === 'max_reps') {
    const reps = working.map((s) => s.reps).filter((r): r is number => r !== null);
    return reps.length ? Math.max(...reps) : null;
  }

  const weighted = working.filter((s) => s.weight !== null && s.reps !== null);
  if (weighted.length === 0) return null;
  if (metric === 'best_set') {
    // The weight as stored, not rounded here: a tenth of a kilogram is a
    // quarter of a pound, so rounding before the chart converts drew a 225 lb
    // set as 225.1. The chart rounds once, in the unit it shows.
    return Math.max(...weighted.map((s) => s.weight as number));
  }
  // est_1rm and any unknown metric. Sets past the ceiling are dropped rather
  // than clamped, so a high-rep-only session plots no point instead of a
  // misleading one — and the chart agrees with the PR the records domain awards.
  const ones = weighted
    .filter((s) => (s.reps as number) <= EST_1RM_MAX_REPS)
    .map((s) => estimated1rm(s.weight, s.reps))
    .filter((o): o is number => o !== null);
  // Left at `estimated1rm`'s two decimals, for the same reason as best_set.
  return ones.length ? Math.max(...ones) : null;
}
