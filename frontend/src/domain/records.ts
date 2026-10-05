/**
 * Personal-record computation & PR detection — ported from the original server
 * implementation. Materializes the `personal_records` rows for the user.
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
import { type Unit, formatVolume, toDisplay, volumeToDisplay, weightText } from './units.ts';

type SetLike = {
  type: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  kind?: 'weighted' | 'bodyweight';
};

/**
 * Most reps a set may carry and still be trusted as a 1RM estimate.
 *
 * Epley is linear in reps, so it keeps rewarding volume long after it stops
 * predicting a single. Left uncapped, 80 kg x 12 scores 112 and beats 100 kg x 3
 * at 110 — the lighter set takes the record, and a set of twenty would take it
 * by a mile. That distorts the PR itself and anything reading it.
 *
 * Ten is the conventional ceiling for the formula. Sets above it are ignored for
 * this metric only; they still count for best_set, best_volume and max_reps.
 */
const EST_1RM_MAX_REPS = 10;

/** Epley 1RM (mirrors domain/stats.ts). */
function estimated1rm(weight: number | null, reps: number | null): number | null {
  if (weight === null || reps === null || reps <= 0) return null;
  if (reps === 1) return Math.round(weight * 100) / 100;
  return Math.round(weight * (1 + reps / 30) * 100) / 100;
}

/** Kg of volume for one set; bodyweight movements add `bodyweightKg` (mirrors domain/stats.ts). */
function setVolume(s: SetLike, bodyweightKg = 0, countWarmups = false): number {
  if (!s.done || s.reps === null) return 0;
  if (s.type === 'warmup' && !countWarmups) return 0;
  if (s.kind === 'bodyweight') {
    const load = bodyweightKg + (s.weight ?? 0);
    return load > 0 ? load * s.reps : 0;
  }
  if (s.weight === null) return 0;
  return s.weight * s.reps;
}

export type PRSet = SetLike & { id: string };
/** A session's sets plus the mover's bodyweight (kg) for volume; 0/absent = unknown. */
export type PRSession = { id: string; achievedAt: number; sets: PRSet[]; bodyweightKg?: number };

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

export function computeRecords(
  sessions: PRSession[],
  countWarmups = false,
): Partial<Record<RecordMetric, RecordValue>> {
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

    // est_1rm — max Epley across weighted sets inside the rep ceiling; first
    // wins on a tie. A user who only ever trains high reps gets no est_1rm,
    // which is honest: there is nothing here to estimate a single from.
    const estimable = weighted.filter((w) => (w.s.reps ?? 0) <= EST_1RM_MAX_REPS);
    if (estimable.length > 0) {
      let top = estimable[0];
      let topRm = estimated1rm(top.s.weight, top.s.reps) ?? 0;
      for (const w of estimable) {
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
  }

  // best_volume — highest single-session working volume; first session wins on a tie.
  let bestSessId: string | null = null;
  let bestVol = 0;
  let bestAt: number | null = null;
  for (const sess of sessions) {
    const vol = sess.sets.reduce((sum, s) => sum + setVolume(s, sess.bodyweightKg ?? 0, countWarmups), 0);
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

/** "68 × 5": a weight, the times sign, then whatever followed it. */
const _WEIGHT_BY_REPS = /^(\d+(?:\.\d+)?) × (.*)$/;

/**
 * A record's stored prose, in the user's unit.
 *
 * `display` is written once, in kilograms, into `personal_records` — and
 * storage stays canonical, so it is re-expressed here on the way out rather
 * than rewritten on a unit change. The two metrics whose whole content is their
 * value are rebuilt from it; the two "weight × reps" ones have their leading
 * weight converted in place, because the reps (and for max_reps, the weight)
 * live only in the prose. Anything unrecognised — "BW × 11", an empty string —
 * is returned as stored.
 */
export function recordDisplay(
  metric: RecordMetric,
  value: number,
  display: string,
  unit: Unit,
): string {
  if (metric === 'est_1rm') return `${Math.round(volumeToDisplay(value, unit))} ${unit}`;
  if (metric === 'best_volume') return formatVolume(value, unit);
  const m = _WEIGHT_BY_REPS.exec(display);
  return m ? `${weightText(Number(m[1]), unit)} × ${m[2]}` : display;
}

/**
 * How much a record improved by, in the user's unit. `delta` is in the
 * metric's stored unit (kg, kg of volume, or reps); null means a first-ever
 * record. In kg this is exactly what `detectPrs` writes as `deltaDisplay`.
 */
export function recordDeltaDisplay(
  metric: RecordMetric,
  delta: number | null,
  unit: Unit,
): string {
  if (delta === null) return 'NEW';
  if (REP_METRICS.has(metric)) return deltaDisplay(metric, delta);
  if (metric === 'best_volume' && unit !== 'kg') return `▲ ${formatVolume(delta, unit)}`;
  return `▲ ${g(toDisplay(delta, unit) as number)} ${unit}`;
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

/** One session of an exercise as `walkPrFlags` decided it. */
export type PrWalkStep = {
  sessionId: string;
  /** The sets of this session that set a record when it was logged. */
  flaggedSetIds: string[];
  /** Every metric the session improved; empty when it set no record. */
  deltas: PRDelta[];
};

/**
 * Re-decides one exercise's records session by session, oldest first.
 *
 * Finishing a workout compares it with the records as they stood, flags the
 * sets that hold a new one, and counts the exercise toward the workout's PR
 * count. This replays exactly that for a whole history: each session is
 * compared with a running baseline of everything before it, through the same
 * `computeRecords` and `detectPrs`. So a past session that changes — or moves
 * in time — re-decides every session after it, not just itself.
 *
 * One pass. Finish recomputes the records over the whole history and keeps
 * what beat the baseline; but every metric is a maximum, and a record only
 * counts when it is strictly beaten, so a set that beats the baseline is in
 * the new session and is that session's own best. Its records alone, set
 * against the baseline, give the same answer without rereading the history
 * before it — which made a whole-database pass quadratic in an exercise's
 * sessions. records.test.ts holds this to the recomputing walk, value for
 * value.
 *
 * Volume is the one metric a session's own records cannot stand in for, and
 * is carried along instead. `computeRecords` reports nothing at all until the
 * history has a working set, and then reports the best volume of every
 * session so far — warm-up-only ones included, when warm-ups count. So the
 * best volume, and the latest session to reach it, are tracked from the
 * start and offered as a record once a working set exists.
 *
 * `best_volume` belongs to a session, not a set, so it appears in `deltas`
 * and flags nothing, as at finish.
 */
export function walkPrFlags(sessions: readonly PRSession[], countWarmups = false): PrWalkStep[] {
  // Two sessions at one instant are walked in id order. A tie goes to whichever
  // comes first, so the order is fixed here, not left to how a caller read them.
  const oldestFirst = sessions
    .slice()
    .sort((a, b) => a.achievedAt - b.achievedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: PrWalkStep[] = [];
  const baseline: Partial<Record<RecordMetric, number>> = {};
  let anyWorking = false;
  let bestVolume = 0;
  let bestVolumeBy: PRSession | null = null;
  for (const sess of oldestFirst) {
    anyWorking ||= sess.sets.some(isWorking);
    const volume = sess.sets.reduce((sum, s) => sum + setVolume(s, sess.bodyweightKg ?? 0, countWarmups), 0);
    // `>=`: of two sessions with the same volume, the records name the later.
    if (volume > 0 && volume >= bestVolume) {
      bestVolume = volume;
      bestVolumeBy = sess;
    }

    const own = computeRecords([sess], countWarmups);
    // In `computeRecords`' own key order, which is the order of `deltas`.
    const current: Partial<Record<RecordMetric, RecordValue>> = {};
    if (own.best_set) current.best_set = own.best_set;
    if (own.est_1rm) current.est_1rm = own.est_1rm;
    if (anyWorking && bestVolumeBy) {
      current.best_volume = {
        metric: 'best_volume',
        value: bestVolume,
        display: `${grouped(bestVolume)} kg`,
        workoutId: bestVolumeBy.id,
        achievedAt: bestVolumeBy.achievedAt,
      };
    }
    if (own.max_reps) current.max_reps = own.max_reps;

    const deltas = detectPrs(baseline, current);
    const flagged = new Set<string>();
    for (const d of deltas) {
      if (d.value.workoutSetId) flagged.add(d.value.workoutSetId);
      baseline[d.metric] = d.value.value;
    }
    out.push({ sessionId: sess.id, flaggedSetIds: [...flagged], deltas });
  }
  return out;
}

/**
 * Whether an exercise is, as stored, one of the PRs a workout's count holds.
 *
 * The count is a bare number, so this is read off what is beside it: a flagged
 * set says yes. With none flagged, only a volume record — which has no set to
 * flag — can have counted, and only where the count has room for it. History
 * that was imported without flags has a count of zero and so holds nothing,
 * whatever a walk over it would find.
 */
export function countsTowardPrCount(
  step: PrWalkStep | undefined,
  hasFlaggedSet: boolean,
  prCount: number,
): boolean {
  if (prCount <= 0) return false;
  if (hasFlaggedSet) return true;
  return !!step && step.deltas.length > 0 && step.flaggedSetIds.length === 0;
}
