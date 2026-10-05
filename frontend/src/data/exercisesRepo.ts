/**
 * Exercise catalog + custom exercises + Exercise-Detail compute, on-device.
 * Ported from the original server implementation. Touches the DB — not node-tested.
 */
import { and, eq, inArray, like, sql } from 'drizzle-orm';

import { atomically, db, type Executor } from '../db/client';
import * as schema from '../db/schema';
import type {
  CategoryOut,
  ChartOut,
  ExerciseOut,
  HistorySessionOut,
  MuscleOut,
  RecordMetric,
  RecordOut,
  SetType,
} from '../api/types';
import { sessionMetric, type SetLike } from '../domain/stats';
import { getBodyweightKg, resolveWorkoutBodyweight } from '../lib/bodyweight';
import { getCountWarmups } from '../lib/warmupVolume';
import {
  groupDuplicates,
  type MergeCandidate,
  type MergeReason,
  type PrCell,
} from '../lib/mergeDuplicates';
import { LOCAL_USER_ID, newId, nowMs } from './ids';
import { toHistorySession, type ExerciseRow } from './map';
import { completedSessionsFor, hydrateExercises, loadExercise } from './queries';
import {
  currentValues,
  prCountHolders,
  rebuildPrCounts,
  recomputeForExercise,
  reflagExercisePrs,
} from './recordStore';

/** 'Incline Bench Press' -> 'IB' (port of serializers.initials_of). */
export function initialsOf(name: string): string {
  const words = name.replace(/\(/g, ' ').split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return letters || name.slice(0, 2).toUpperCase();
}

const localDay = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function listCategories(): Promise<CategoryOut[]> {
  const rows = await db.select().from(schema.categories);
  return rows.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listMuscles(): Promise<MuscleOut[]> {
  const rows = await db.select().from(schema.muscles);
  return rows.map((m) => ({ id: m.id, name: m.name, group: m.group }));
}

export async function listExercises(
  params: { search?: string; category?: string } = {},
): Promise<ExerciseOut[]> {
  const filters = [] as ReturnType<typeof like>[];
  if (params.search) filters.push(like(schema.exercises.name, `%${params.search}%`));
  if (params.category) {
    const cat = (await db.select().from(schema.categories).where(eq(schema.categories.name, params.category)))[0];
    filters.push(eq(schema.exercises.categoryId, cat ? cat.id : '__none__'));
  }
  const rows = await db
    .select()
    .from(schema.exercises)
    .where(filters.length ? and(...filters) : undefined);
  const byId = await hydrateExercises(rows as ExerciseRow[]);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getExercise(id: string): Promise<ExerciseOut> {
  const ex = await loadExercise(id);
  if (!ex) throw new Error('exercise not found');
  return ex;
}

export async function createExercise(body: {
  name: string;
  kind: string;
  equipment: string;
  category_id?: string | null;
  primary_muscle_id?: string | null;
  secondary_muscle_ids?: string[];
  how_to_steps?: string[] | null;
}): Promise<ExerciseOut> {
  const id = newId();
  await atomically(async () => {
    await db.insert(schema.exercises).values({
      id,
      userId: LOCAL_USER_ID,
      name: body.name,
      initials: initialsOf(body.name),
      kind: body.kind,
      equipment: body.equipment,
      categoryId: body.category_id ?? null,
      primaryMuscleId: body.primary_muscle_id ?? null,
      howToSteps: body.how_to_steps ?? null,
      isCustom: 1,
      updatedAt: nowMs(),
    });
    const secondary = body.secondary_muscle_ids ?? [];
    if (secondary.length) {
      await db
        .insert(schema.exerciseSecondaryMuscles)
        .values(secondary.map((muscleId) => ({ exerciseId: id, muscleId })));
    }
  });
  return getExercise(id);
}

export async function patchExercise(
  id: string,
  body: Partial<{ name: string; how_to_steps: string[] | null; demo_url: string | null }>,
): Promise<ExerciseOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
  if (body.name !== undefined) {
    patch.name = body.name;
    patch.initials = initialsOf(body.name);
  }
  if (body.how_to_steps !== undefined) patch.howToSteps = body.how_to_steps;
  if (body.demo_url !== undefined) patch.demoUrl = body.demo_url;
  await db.update(schema.exercises).set(patch).where(eq(schema.exercises.id, id));
  return getExercise(id);
}

export async function getExerciseHistory(id: string): Promise<HistorySessionOut[]> {
  const sessions = await completedSessionsFor(id);
  return sessions.map((s) =>
    toHistorySession(
      s.workoutId,
      s.startedAt,
      [...s.sets].sort((a, b) => a.position - b.position),
    ),
  );
}

/**
 * How much each exercise has actually been trained: completed sessions it
 * appeared in, and when the most recent of those was.
 *
 * One grouped query rather than a scan per exercise — the library calls this on
 * mount, and it is the only thing standing between a 700-row catalog and the
 * dozen lifts the user came to find. Exercises never trained are simply absent.
 */
export async function listExerciseUsage(): Promise<Map<string, { sessions: number; lastAt: number }>> {
  const rows = await db
    .select({
      exerciseId: schema.workoutExercises.exerciseId,
      sessions: sql<number>`count(distinct ${schema.workoutExercises.workoutId})`,
      lastAt: sql<number>`max(${schema.workouts.startedAt})`,
    })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .where(eq(schema.workouts.status, 'completed'))
    .groupBy(schema.workoutExercises.exerciseId);

  const out = new Map<string, { sessions: number; lastAt: number }>();
  for (const r of rows) {
    if (!r.exerciseId) continue;
    out.set(r.exerciseId, { sessions: Number(r.sessions) || 0, lastAt: Number(r.lastAt) || 0 });
  }
  return out;
}

export async function getExerciseRecords(id: string): Promise<RecordOut[]> {
  const rows = await db
    .select()
    .from(schema.personalRecords)
    .where(eq(schema.personalRecords.exerciseId, id));
  // Carry the originating set's numbers alongside the record. `display` is prose
  // ("121 kg"), and the 1RM calculator needs the weight and reps behind it. A
  // left join rather than a second round trip per card; a set deleted since the
  // record was written simply leaves them null.
  const setIds = rows.map((r) => r.workoutSetId).filter((x): x is string => !!x);
  const sets = setIds.length
    ? await db.select().from(schema.workoutSets).where(inArray(schema.workoutSets.id, setIds))
    : [];
  const bySetId = new Map(sets.map((s) => [s.id, s]));
  return rows.map((r) => {
    const src = r.workoutSetId ? bySetId.get(r.workoutSetId) : undefined;
    return {
      metric: r.metric as RecordMetric,
      value: r.value,
      display: r.display,
      achieved_at: r.achievedAt === null ? null : new Date(r.achievedAt).toISOString(),
      weight: src?.weight ?? null,
      reps: src?.reps ?? null,
    };
  });
}

/**
 * A metric's series for one exercise.
 *
 * `since` reads everything from a timestamp forward; `sessions` keeps the old
 * "last N" behaviour for callers that want a thumbnail. Points carry their real
 * timestamp so the chart can space them by time — spacing sessions evenly made
 * a three-month layoff look like a week off.
 */
export async function getExerciseChart(
  id: string,
  metric: RecordMetric = 'est_1rm',
  opts: { since?: number | null; sessions?: number } = {},
): Promise<ChartOut> {
  const done = (await completedSessionsFor(id)).slice().reverse(); // oldest first
  // A bodyweight movement's volume counts the mover's mass; resolve it per day
  // (snapshot, else current). Only the best_volume metric consumes it.
  const exRow = (await db.select({ kind: schema.exercises.kind }).from(schema.exercises).where(eq(schema.exercises.id, id)))[0];
  const kind = (exRow?.kind as 'weighted' | 'bodyweight') ?? 'weighted';
  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();
  // Group by local day; sets that are done only (session_metric excludes undone).
  const byDay = new Map<string, SetLike[]>();
  const bwByDay = new Map<string, number>();
  // Earliest start seen for a day, so a point sits on the real date rather than
  // on whichever session of that day happened to be read last.
  const dayStart = new Map<string, number>();
  for (const s of done) {
    const key = localDay(s.startedAt);
    const list = byDay.get(key) ?? [];
    for (const set of s.sets) {
      list.push({ type: set.type as SetType, weight: set.weight, reps: set.reps, done: set.done !== 0, kind });
    }
    byDay.set(key, list);
    bwByDay.set(key, resolveWorkoutBodyweight(s.bodyweightKg, currentBw));
    const seen = dayStart.get(key);
    if (seen == null || s.startedAt < seen) dayStart.set(key, s.startedAt);
  }
  const points: { label: string; value: number; t: number }[] = [];
  for (const [label, sets] of byDay) {
    const v = sessionMetric(sets, metric, bwByDay.get(label) ?? 0, countWarmups);
    if (v !== null) points.push({ label, value: v, t: dayStart.get(label) ?? 0 });
  }
  const inRange =
    opts.since != null ? points.filter((p) => p.t >= (opts.since as number)) : points;
  const last = opts.sessions != null ? inRange.slice(-opts.sessions) : inRange;
  return {
    metric,
    labels: last.map((p) => p.label),
    values: last.map((p) => p.value),
    times: last.map((p) => p.t),
  };
}

// --- Merge duplicate exercises -------------------------------------------

/** One candidate row in a duplicate group, with the stats the flow shows. */
export type MergeMemberView = {
  id: string;
  name: string;
  initials: string;
  equipment: string;
  isCatalog: boolean;
  setCount: number;
  workoutCount: number;
  /** Distinct routines that reference this exercise (for the re-point preview). */
  routineCount: number;
  /** Epoch-ms of the first logged session, for the "since <date>" line. */
  firstWorkoutMs: number | null;
  /** Materialized PRs, for the M3 "best of each" preview. */
  prs: PrCell[];
};

export type MergeGroupView = {
  reason: MergeReason;
  survivorId: string;
  survivorReason: string;
  members: MergeMemberView[];
};

/** Result of a merge write, for the M5 receipt. */
export type MergeResult = {
  survivorId: string;
  survivorName: string;
  /** Sets that changed parent (the discarded rows' logged sets). */
  setsMoved: number;
  /** Distinct routines that were re-pointed. */
  routinesUpdated: number;
  /** Survivor's logged-set total after the merge. */
  totalSets: number;
  /** A record the survivor gained from a discarded row, if any. */
  gainedPr: { metric: RecordMetric; value: number; display: string } | null;
};

/** Thrown when a live workout references a candidate — the merge is blocked. */
export class ActiveSessionError extends Error {
  constructor() {
    super('A workout is in progress that uses one of these exercises. Finish it first.');
    this.name = 'ActiveSessionError';
  }
}

type ExerciseStat = { setCount: number; workoutCount: number; firstWorkoutMs: number | null };

/** Logged-set counts, workout counts and first-session dates, batched by exercise. */
async function exerciseStats(ids: string[]): Promise<Map<string, ExerciseStat>> {
  const out = new Map<string, ExerciseStat>();
  for (const id of ids) out.set(id, { setCount: 0, workoutCount: 0, firstWorkoutMs: null });
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      exerciseId: schema.workoutExercises.exerciseId,
      workoutId: schema.workouts.id,
      startedAt: schema.workouts.startedAt,
      done: schema.workoutSets.done,
    })
    .from(schema.workouts)
    .innerJoin(schema.workoutExercises, eq(schema.workoutExercises.workoutId, schema.workouts.id))
    .innerJoin(schema.workoutSets, eq(schema.workoutSets.workoutExerciseId, schema.workoutExercises.id))
    .where(and(inArray(schema.workoutExercises.exerciseId, ids), eq(schema.workouts.status, 'completed')));

  const workoutsByEx = new Map<string, Set<string>>();
  for (const r of rows) {
    const stat = out.get(r.exerciseId);
    if (!stat) continue;
    if (r.done !== 0) stat.setCount += 1;
    const seen = workoutsByEx.get(r.exerciseId) ?? new Set<string>();
    seen.add(r.workoutId);
    workoutsByEx.set(r.exerciseId, seen);
    stat.firstWorkoutMs =
      stat.firstWorkoutMs === null ? r.startedAt : Math.min(stat.firstWorkoutMs, r.startedAt);
  }
  for (const [id, seen] of workoutsByEx) {
    const stat = out.get(id);
    if (stat) stat.workoutCount = seen.size;
  }
  return out;
}

/** Distinct routines referencing each exercise, batched. */
async function routineCountsByExercise(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, 0);
  if (ids.length === 0) return out;
  const rows = await db
    .select({ exerciseId: schema.routineExercises.exerciseId, routineId: schema.routineExercises.routineId })
    .from(schema.routineExercises)
    .where(inArray(schema.routineExercises.exerciseId, ids));
  const byEx = new Map<string, Set<string>>();
  for (const r of rows) {
    const seen = byEx.get(r.exerciseId) ?? new Set<string>();
    seen.add(r.routineId);
    byEx.set(r.exerciseId, seen);
  }
  for (const [id, seen] of byEx) out.set(id, seen.size);
  return out;
}

/** Materialized PR cells, batched by exercise. */
async function prsByExercise(ids: string[]): Promise<Map<string, PrCell[]>> {
  const out = new Map<string, PrCell[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select()
    .from(schema.personalRecords)
    .where(inArray(schema.personalRecords.exerciseId, ids));
  for (const r of rows) {
    const list = out.get(r.exerciseId) ?? [];
    list.push({ metric: r.metric as RecordMetric, value: r.value, display: r.display });
    out.set(r.exerciseId, list);
  }
  return out;
}

/**
 * Detect duplicate-exercise groups across the whole library. Runs on demand
 * (the count is cheap at this scale; no background job). Pure grouping lives in
 * lib/mergeDuplicates; this only assembles rows + stats and dresses the result.
 */
export async function findDuplicateGroups(): Promise<MergeGroupView[]> {
  const rows = (await db.select().from(schema.exercises)) as (ExerciseRow & { userId: string | null })[];
  const ids = rows.map((r) => r.id);
  const [stats, prs, routineCounts] = await Promise.all([
    exerciseStats(ids),
    prsByExercise(ids),
    routineCountsByExercise(ids),
  ]);

  const candidates: MergeCandidate[] = rows.map((r) => {
    const stat = stats.get(r.id) ?? { setCount: 0, workoutCount: 0, firstWorkoutMs: null };
    return {
      id: r.id,
      name: r.name,
      equipment: r.equipment,
      primaryMuscleId: r.primaryMuscleId,
      source: r.source,
      externalId: r.externalId,
      isCatalog: r.userId === null && r.isCustom === 0,
      initials: r.initials,
      setCount: stat.setCount,
      workoutCount: stat.workoutCount,
      firstWorkoutMs: stat.firstWorkoutMs,
    };
  });

  const groups = groupDuplicates(candidates);
  const byId = new Map(candidates.map((c) => [c.id, c]));

  return groups.map((g) => ({
    reason: g.reason,
    survivorId: g.survivorId,
    survivorReason: g.survivorReason,
    members: g.members.map((m) => {
      const c = byId.get(m.id)!;
      return {
        id: c.id,
        name: c.name,
        initials: c.initials,
        equipment: c.equipment,
        isCatalog: c.isCatalog,
        setCount: c.setCount,
        workoutCount: c.workoutCount,
        routineCount: routineCounts.get(c.id) ?? 0,
        firstWorkoutMs: c.firstWorkoutMs,
        prs: prs.get(c.id) ?? [],
      };
    }),
  }));
}

/** Number of duplicate groups — the accent count pill in Settings → DATA. */
export async function countDuplicateGroups(): Promise<number> {
  return (await findDuplicateGroups()).length;
}

/** Total exercises in the library — the M6 "across all N exercises" copy. */
export async function countExercises(): Promise<number> {
  return (await db.select({ id: schema.exercises.id }).from(schema.exercises)).length;
}

/**
 * Build a manual merge group from an explicit id set (library multi-select).
 * User-asserted, so it skips the auto-detection signals, but still honours the
 * hard guards: two catalog rows can't both survive, and a live session blocks
 * it. Survivor defaults to catalog, else the row with more history.
 */
export async function buildManualGroup(ids: string[]): Promise<MergeGroupView | null> {
  const unique = [...new Set(ids)];
  if (unique.length < 2) return null;
  const rows = (await db
    .select()
    .from(schema.exercises)
    .where(inArray(schema.exercises.id, unique))) as (ExerciseRow & { userId: string | null })[];
  if (rows.length < 2) return null;
  // Two catalog rows must never be merged into one.
  if (rows.filter((r) => r.userId === null && r.isCustom === 0).length > 1) return null;

  const [stats, prs, routineCounts] = await Promise.all([
    exerciseStats(unique),
    prsByExercise(unique),
    routineCountsByExercise(unique),
  ]);
  const members: MergeMemberView[] = rows.map((r) => {
    const stat = stats.get(r.id) ?? { setCount: 0, workoutCount: 0, firstWorkoutMs: null };
    return {
      id: r.id,
      name: r.name,
      initials: r.initials,
      equipment: r.equipment,
      isCatalog: r.userId === null && r.isCustom === 0,
      setCount: stat.setCount,
      workoutCount: stat.workoutCount,
      routineCount: routineCounts.get(r.id) ?? 0,
      firstWorkoutMs: stat.firstWorkoutMs,
      prs: prs.get(r.id) ?? [],
    };
  });

  // Survivor: catalog, else most history (mirrors pickSurvivor's rule).
  const catalog = members.filter((m) => m.isCatalog);
  const ordered = [...members].sort((a, b) => {
    if (b.workoutCount !== a.workoutCount) return b.workoutCount - a.workoutCount;
    if (b.setCount !== a.setCount) return b.setCount - a.setCount;
    return (a.firstWorkoutMs ?? Infinity) - (b.firstWorkoutMs ?? Infinity);
  });
  const survivor = catalog.length === 1 ? catalog[0] : ordered[0];
  const sortedMembers = [survivor, ...ordered.filter((m) => m.id !== survivor.id)];

  return {
    reason: 'same_name',
    survivorId: survivor.id,
    survivorReason:
      catalog.length === 1
        ? 'Keeps images, how-to and muscle data'
        : 'More history — fewer records move',
    members: sortedMembers,
  };
}

/** Ids referenced by a live (active) workout, among the given set. */
async function activelyReferenced(ids: string[], ex: Executor = db): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await ex
    .select({ exerciseId: schema.workoutExercises.exerciseId })
    .from(schema.workoutExercises)
    .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
    .where(and(inArray(schema.workoutExercises.exerciseId, ids), eq(schema.workouts.status, 'active')));
  return new Set(rows.map((r) => r.exerciseId));
}

/**
 * Merge duplicates into one survivor. Re-points workout_exercises and
 * routine_exercises to the survivor (sets never move — they hang off
 * workout_exercise_id, so re-pointing the parent carries them), reconciles PRs
 * by recomputing from the survivor's now-combined history — the records, the
 * PR flags on its sets and the PR counts of the workouts involved — and
 * deletes each discarded exercise plus its secondary-muscle links. Blocks if a live workout
 * references any candidate. Atomic — a crash mid-merge leaves nothing half-done.
 */
export async function mergeExercises(
  survivorId: string,
  loserIds: string[],
): Promise<MergeResult> {
  const losers = [...new Set(loserIds)].filter((id) => id !== survivorId);
  if (losers.length === 0) throw new Error('nothing to merge');

  const survivorRow = (
    await db.select().from(schema.exercises).where(eq(schema.exercises.id, survivorId))
  )[0];
  if (!survivorRow) throw new Error('survivor not found');

  // How many logged sets belong to the discarded rows (for the receipt).
  const loserStats = await exerciseStats(losers);
  const setsMoved = losers.reduce((sum, id) => sum + (loserStats.get(id)?.setCount ?? 0), 0);

  // Distinct routines that will be re-pointed.
  const routineRows = await db
    .select({ routineId: schema.routineExercises.routineId })
    .from(schema.routineExercises)
    .where(inArray(schema.routineExercises.exerciseId, losers));
  const routinesUpdated = new Set(routineRows.map((r) => r.routineId)).size;

  let gainedPr: { metric: RecordMetric; value: number; display: string } | null = null;

  // Resolve the bodyweight and warmup-volume flag BEFORE the transaction — a
  // SecureStore read inside an expo-sqlite transaction hangs it (that froze the
  // merge). Both flow into the survivor's PR recompute.
  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  await atomically(async (tx) => {
    // Mid-workout guard — never re-point rows underneath a live session. Asked
    // inside the unit that re-points them: asked before it, a workout started
    // during the SecureStore waits above went unseen.
    const active = await activelyReferenced([survivorId, ...losers], tx);
    if (active.size > 0) throw new ActiveSessionError();

    const baseline = await currentValues(survivorId, tx);
    const now = nowMs();

    // Which workouts count the survivor, or a row about to be folded into it,
    // among their PRs. Read before anything moves, as an edit does.
    const heldBefore = new Set<string>();
    for (const eid of [survivorId, ...losers]) {
      for (const wid of await prCountHolders(eid, tx, currentBw, countWarmups)) heldBefore.add(wid);
    }

    // 1. Re-point workout_exercises → survivor.
    await tx
      .update(schema.workoutExercises)
      .set({ exerciseId: survivorId, updatedAt: now })
      .where(inArray(schema.workoutExercises.exerciseId, losers));

    // 2. Re-point routine_exercises → survivor.
    await tx
      .update(schema.routineExercises)
      .set({ exerciseId: survivorId, updatedAt: now })
      .where(inArray(schema.routineExercises.exerciseId, losers));

    // 3. Drop the discarded rows' PRs; the survivor's are recomputed below from
    //    the now-combined history, which keeps the higher value per metric.
    await tx.delete(schema.personalRecords).where(inArray(schema.personalRecords.exerciseId, losers));

    // 4. Delete the discarded exercises + their secondary-muscle links.
    await tx
      .delete(schema.exerciseSecondaryMuscles)
      .where(inArray(schema.exerciseSecondaryMuscles.exerciseId, losers));
    await tx.delete(schema.exercises).where(inArray(schema.exercises.id, losers));

    // 5. Recompute the survivor's PRs across everything it now owns.
    await recomputeForExercise(survivorId, tx, currentBw, countWarmups);

    // 6. Re-decide the stars across the combined history: it has one "first
    //    ever", not one per row it was split across. Then the counts. A workout
    //    that logged both rows counted each, which a one-step adjustment cannot
    //    undo, so the workouts involved have theirs rebuilt from scratch.
    const steps = await reflagExercisePrs(survivorId, tx, currentBw, countWarmups, heldBefore);
    await rebuildPrCounts([...new Set([...steps.keys(), ...heldBefore])], tx, currentBw, countWarmups);

    // A record the survivor did not have (or beat) before this merge = gained.
    const after = await currentValues(survivorId, tx);
    const afterRows = await tx
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.exerciseId, survivorId));
    const displayByMetric = new Map(afterRows.map((r) => [r.metric as RecordMetric, r.display]));
    const HEADLINE: RecordMetric[] = ['best_set', 'est_1rm', 'max_reps', 'best_volume'];
    for (const metric of HEADLINE) {
      const before = baseline[metric];
      const now2 = after[metric];
      if (now2 !== undefined && (before === undefined || now2 > before)) {
        gainedPr = { metric, value: now2, display: displayByMetric.get(metric) ?? '' };
        break;
      }
    }
  });

  const survivorStat = (await exerciseStats([survivorId])).get(survivorId);
  return {
    survivorId,
    survivorName: survivorRow.name,
    setsMoved,
    routinesUpdated,
    totalSets: survivorStat?.setCount ?? 0,
    gainedPr,
  };
}

/**
 * Fold exercises that share a name (case-insensitively) into one row. Import
 * matched the catalog by exact case only, so any casing/whitespace difference
 * spawned a duplicate custom exercise that split history and PRs across two rows
 * for the same movement. This reunites them at the data layer.
 *
 * Safe to run on every launch: idempotent (a no-op once names are unique), and a
 * shared name unambiguously means the same movement — the catalog holds no two
 * exercises with the same name. The catalog entry is kept as the survivor; a
 * group a live session is mid-use of is skipped (left for the manual merge tool).
 * Best-effort per group — one failure never blocks the rest or the app start.
 */
export async function dedupeExercisesByName(): Promise<number> {
  const all = await db
    .select({ id: schema.exercises.id, name: schema.exercises.name, isCustom: schema.exercises.isCustom })
    .from(schema.exercises);
  const byKey = new Map<string, { id: string; isCustom: number }[]>();
  for (const e of all) {
    const key = e.name.trim().toLowerCase();
    const list = byKey.get(key) ?? [];
    list.push({ id: e.id, isCustom: e.isCustom });
    byKey.set(key, list);
  }
  let folded = 0;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    // Keep the catalog row (isCustom 0) if present, else the first seen.
    const survivor = group.find((g) => g.isCustom === 0) ?? group[0];
    const losers = group.filter((g) => g.id !== survivor.id).map((g) => g.id);
    if (losers.length === 0) continue;
    try {
      await mergeExercises(survivor.id, losers);
      folded += losers.length;
    } catch {
      // ActiveSessionError or a transient failure — leave this group as-is.
    }
  }
  return folded;
}
