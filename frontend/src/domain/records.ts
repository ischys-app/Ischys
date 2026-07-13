/**
 * Personal-record computation & PR detection — a straight port of
 * backend/app/services/records.py, kept behaviourally identical so the client
 * materializes the same `personal_records` the server would.
 *
 * Four metrics per (user, exercise):
 * - best_set    — heaviest working set (weight, tiebreak reps)
 * - est_1rm     — max Epley 1RM across working sets
 * - best_volume — highest single-session working volume
 * - max_reps    — working set with the most reps (bodyweight allowed)
 *
 * Pure and self-contained (node --test can't import a sibling source .ts, so the
 * two stats helpers are inlined here — kept in step with domain/stats.ts).
 */
import type { RecordMetric } from '../api/types.ts';

type SetLike = { type: string; weight: number | null; reps: number | null; done: boolean };

/** Epley 1RM (mirrors domain/stats.ts). */
function estimated1rm(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || reps <= 0) return null;
  if (reps === 1) return Math.round(weight * 100) / 100;
  return Math.round(weight * (1 + reps / 30) * 100) / 100;
}

/** Kg of volume for one set; 0 for warmups/undone/missing (mirrors domain/stats.ts). */
function setVolume(s: SetLike): number {
  if (!s.done || s.type === 'warmup' || s.weight === null || s.reps === null) return 0;
  return s.weight * s.reps;
}

export type PRSet = SetLike & { id: string };
export type PRSession = { id: string; achievedAt: number; sets: PRSet[] };

export type RecordValue = {
  metric: RecordMetric;
  value: number;
  display: string;
  workoutId?: string;
  workoutSetId?: string;
  weight?: number | null;
  reps?: number | null;
  achievedAt?: number | null;
};

export type PRDelta = {
  metric: RecordMetric;
  value: RecordValue;
  previous: number | null;
  delta: number;
  deltaDisplay: string;
};

/** Python `f"{x:g}"` — drop trailing zeros. JS numbers already do this. */
const g = (x: number): string => String(x);

/** Python `f"{x:,.0f}"` — thousands-separated, no decimals (Hermes-safe grouping). */
const grouped = (x: number): string =>
  String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const isWorking = (s: PRSet): boolean => s.done && s.type !== 'warmup';

export function computeRecords(sessions: PRSession[]): Partial<Record<RecordMetric, RecordValue>> {
  const working: { sess: PRSession; s: PRSet }[] = [];
  for (const sess of sessions) for (const s of sess.sets) if (isWorking(s)) working.push({ sess, s });
  if (working.length === 0) return {};

  const records: Partial<Record<RecordMetric, RecordValue>> = {};
  const weighted = working.filter((w) => w.s.weight !== null && w.s.reps !== null);

  if (weighted.length > 0) {
    // best_set — heaviest weighted set (weight, then reps); first wins on a tie.
    let best = weighted[0];
    for (const w of weighted) {
      if (w.s.weight! > best.s.weight! || (w.s.weight === best.s.weight && w.s.reps! > best.s.reps!)) {
        best = w;
      }
    }
    records.best_set = {
      metric: 'best_set',
      value: Number(best.s.weight),
      display: `${g(best.s.weight!)} × ${best.s.reps}`,
      workoutId: best.sess.id,
      workoutSetId: best.s.id,
      weight: best.s.weight,
      reps: best.s.reps,
      achievedAt: best.sess.achievedAt,
    };

    // est_1rm — max Epley across weighted sets; first wins on a tie.
    let top = weighted[0];
    let topRm = estimated1rm(top.s.weight, top.s.reps) ?? 0;
    for (const w of weighted) {
      const rm = estimated1rm(w.s.weight, w.s.reps) ?? 0;
      if (rm > topRm) {
        topRm = rm;
        top = w;
      }
    }
    const oneRm = estimated1rm(top.s.weight, top.s.reps) as number;
    records.est_1rm = {
      metric: 'est_1rm',
      value: oneRm,
      display: `${Math.round(oneRm)} kg`,
      workoutId: top.sess.id,
      workoutSetId: top.s.id,
      weight: top.s.weight,
      reps: top.s.reps,
      achievedAt: top.sess.achievedAt,
    };
  }

  // best_volume — highest single-session working volume; first session wins on a tie.
  let bestSessId: string | null = null;
  let bestVol = 0;
  let bestAt: number | null = null;
  for (const sess of sessions) {
    const vol = sess.sets.reduce((sum, s) => sum + setVolume(s), 0);
    if (vol > bestVol) {
      bestSessId = sess.id;
      bestVol = vol;
      bestAt = sess.achievedAt;
    }
  }
  if (bestVol > 0) {
    records.best_volume = {
      metric: 'best_volume',
      value: bestVol,
      display: `${grouped(bestVol)} kg`,
      workoutId: bestSessId ?? undefined,
      achievedAt: bestAt,
    };
  }

  // max_reps — working set with the most reps (bodyweight allowed); first wins on a tie.
  const withReps = working.filter((w) => w.s.reps !== null);
  if (withReps.length > 0) {
    let mr = withReps[0];
    for (const w of withReps) if (w.s.reps! > mr.s.reps!) mr = w;
    const disp = mr.s.weight !== null ? `${g(mr.s.weight)} × ${mr.s.reps}` : `BW × ${mr.s.reps}`;
    records.max_reps = {
      metric: 'max_reps',
      value: Number(mr.s.reps),
      display: disp,
      workoutId: mr.sess.id,
      workoutSetId: mr.s.id,
      weight: mr.s.weight,
      reps: mr.s.reps,
      achievedAt: mr.sess.achievedAt,
    };
  }

  return records;
}

const REP_METRICS = new Set<RecordMetric>(['max_reps']);

function deltaDisplay(metric: RecordMetric, delta: number): string {
  if (REP_METRICS.has(metric)) return `▲ ${g(delta)} ${delta === 1 ? 'rep' : 'reps'}`;
  return `▲ ${g(delta)} kg`;
}

/** Metrics that strictly improved over `previous` (absent metric = first-ever PR). */
export function detectPrs(
  previous: Partial<Record<RecordMetric, number>>,
  current: Partial<Record<RecordMetric, RecordValue>>,
): PRDelta[] {
  const out: PRDelta[] = [];
  for (const rv of Object.values(current) as RecordValue[]) {
    const prior = previous[rv.metric];
    if (prior === undefined) {
      out.push({ metric: rv.metric, value: rv, previous: null, delta: rv.value, deltaDisplay: 'NEW' });
    } else if (rv.value > prior) {
      const delta = Math.round((rv.value - prior) * 100) / 100;
      out.push({ metric: rv.metric, value: rv, previous: prior, delta, deltaDisplay: deltaDisplay(rv.metric, delta) });
    }
  }
  return out;
}

// The one PR to headline on a summary card: best_set > est_1rm > max_reps > best_volume.
const HEADLINE_ORDER: RecordMetric[] = ['best_set', 'est_1rm', 'max_reps', 'best_volume'];

export function headlinePr(deltas: PRDelta[]): PRDelta | null {
  const byMetric = new Map(deltas.map((d) => [d.metric, d]));
  for (const metric of HEADLINE_ORDER) {
    const d = byMetric.get(metric);
    if (d) return d;
  }
  return null;
}
