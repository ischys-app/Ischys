/**
 * The one-time PR flag pass over the whole database (#91), and the hook that
 * runs it once after an update.
 *
 * History imported before imports derived their own flags has no `is_pr` and
 * no `pr_count`, except on the exercises some later edit happened to re-walk.
 * This walks every exercise once so the whole log agrees, records that it ran,
 * and never runs again. What to write is decided in domain/prBackfill.ts; this
 * file reads the database, writes the plan, and keeps the marker.
 *
 * It is best-effort and out of the way by construction:
 *
 *  - It starts after the UI is up and never throws into it. Any failure leaves
 *    the marker unwritten, and the next launch tries again. A failure, or a
 *    pass put off, is logged: one that fails the same way at every launch
 *    would otherwise never be seen.
 *  - Reading is done a page at a time with the JS thread handed back between
 *    pages, so no single stretch is long enough to drop frames.
 *  - Writing is one real transaction. Every statement in it is run
 *    synchronously inside the callback, so `begin` … `commit` brackets all of
 *    them and a throw rolls all of them back. (An `async` callback would not
 *    do: this driver commits as soon as the callback returns its promise.)
 *  - It cannot interleave with a finish, an edit or an import. Those run their
 *    statements back to back on microtasks, so each is over before the next
 *    timer fires, and this only ever yields on timers: it sees their work
 *    whole or not at all. If anything at all was written between the first
 *    page and the write, the plan is stale, so it is thrown away and read
 *    again; the check and the write share one synchronous stretch, so nothing
 *    can slip between them. An import holds one real transaction open for
 *    its whole length (db/atomic.ts); should one ever be open when this looks,
 *    it waits, rather than plan from rows that may yet be rolled back.
 */
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { useEffect } from 'react';

import { db, transactionOpen } from '../db/client';
import * as schema from '../db/schema';
import {
  PR_BACKFILL_VERSION,
  decidePrBackfill,
  diffPrState,
  newPrWalkTally,
  prHistories,
  tallyPrWalk,
  type PrBackfillPlan,
  type PrSetRow,
} from '../domain/prBackfill';
import { getBodyweightKg } from '../lib/bodyweight';
import { getCountWarmups } from '../lib/warmupVolume';
import { nowMs } from './ids';
import { SETTINGS_ID } from './settingsRepo';

/**
 * The version of the pass that last completed (see `PR_BACKFILL_VERSION`) lives
 * on the settings row, not in SecureStore: the Keychain outlives a reinstall
 * and knows nothing of a database file restored under it, and a marker stored
 * with the data commits in the same transaction as the flags it vouches for.
 */
function storedVersion(): string | null {
  const row = db
    .select({ v: schema.settings.prBackfillVersion })
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ID))
    .all()[0];
  return row ? String(row.v) : null;
}

/** Records the pass as done. `via` is the transaction to join, or the bare connection. */
function markDone(via: Pick<typeof db, 'insert'> = db): void {
  via
    .insert(schema.settings)
    .values({ id: SETTINGS_ID, prBackfillVersion: PR_BACKFILL_VERSION })
    .onConflictDoUpdate({
      target: schema.settings.id,
      set: { prBackfillVersion: PR_BACKFILL_VERSION },
    })
    .run();
}

/** Sets read per page: a few milliseconds of work each. */
const PAGE = 2000;
/** Ids per statement, well inside SQLite's bound-parameter limit. */
const SLICE = 400;
/** How long the walk runs before handing the thread back: half a frame. */
const SLICE_MS = 8;
/** How long after the database is ready the pass starts, so first paint and its queries go first. */
const START_DELAY_MS = 2000;
/** Fresh reads to try before leaving it to the next launch. */
const ATTEMPTS = 3;

/** Hands the JS thread back: a timer, so pending touches, frames and writes run first. */
const breathe = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Rows this connection has changed since it opened: moves on any write, by anyone. */
function writesSoFar(): number {
  return db.get<{ n: number }>(sql`select total_changes() as n`).n;
}

function hasCompletedWorkout(): boolean {
  return (
    db
      .select({ id: schema.workouts.id })
      .from(schema.workouts)
      .where(eq(schema.workouts.status, 'completed'))
      .limit(1)
      .all().length > 0
  );
}

/** Every set of every completed workout, a page at a time. */
async function readSets(): Promise<PrSetRow[]> {
  const out: PrSetRow[] = [];
  let after = '';
  for (;;) {
    const page = db
      .select({
        setId: schema.workoutSets.id,
        workoutId: schema.workouts.id,
        exerciseId: schema.workoutExercises.exerciseId,
        startedAt: schema.workouts.startedAt,
        bodyweightKg: schema.workouts.bodyweightKg,
        exercisePosition: schema.workoutExercises.position,
        position: schema.workoutSets.position,
        type: schema.workoutSets.type,
        weight: schema.workoutSets.weight,
        reps: schema.workoutSets.reps,
        done: schema.workoutSets.done,
        isPr: schema.workoutSets.isPr,
      })
      .from(schema.workoutSets)
      .innerJoin(schema.workoutExercises, eq(schema.workoutExercises.id, schema.workoutSets.workoutExerciseId))
      .innerJoin(schema.workouts, eq(schema.workouts.id, schema.workoutExercises.workoutId))
      .where(and(eq(schema.workouts.status, 'completed'), gt(schema.workoutSets.id, after)))
      .orderBy(asc(schema.workoutSets.id))
      .limit(PAGE)
      .all();
    for (const r of page) out.push({ ...r, done: r.done !== 0, isPr: r.isPr !== 0 });
    if (page.length < PAGE) return out;
    after = page[page.length - 1].setId;
    await breathe();
  }
}

/** Writes a plan: all of it or none of it. Synchronous on purpose — see the file comment. */
function writePlan(plan: PrBackfillPlan): void {
  const byCount = new Map<number, string[]>();
  for (const [workoutId, count] of plan.prCounts) {
    const ids = byCount.get(count);
    if (ids) ids.push(workoutId);
    else byCount.set(count, [workoutId]);
  }
  db.transaction((tx) => {
    const updatedAt = nowMs();
    const flag = (ids: string[], isPr: 0 | 1) => {
      for (let i = 0; i < ids.length; i += SLICE) {
        tx.update(schema.workoutSets)
          .set({ isPr, updatedAt })
          .where(inArray(schema.workoutSets.id, ids.slice(i, i + SLICE)))
          .run();
      }
    };
    flag(plan.lower, 0);
    flag(plan.raise, 1);
    for (const [prCount, ids] of byCount) {
      for (let i = 0; i < ids.length; i += SLICE) {
        tx.update(schema.workouts)
          .set({ prCount, updatedAt })
          .where(inArray(schema.workouts.id, ids.slice(i, i + SLICE)))
          .run();
      }
    }
    // In the same commit as the flags: done means these rows, in this file.
    markDone(tx);
  });
}

export type PrBackfillOutcome =
  /** Already done on this device. */
  | 'skipped'
  /** Nothing to walk; recorded as done. */
  | 'marked'
  /** Walked, written and recorded. */
  | 'done'
  /** Other writes kept landing mid-read; left for the next launch. */
  | 'deferred';

/**
 * Runs the pass if this device still owes it. Throws on failure, with nothing
 * written and the marker untouched; `usePrFlagBackfill` is the caller that
 * swallows that.
 */
export async function runPrBackfillIfOwed(): Promise<PrBackfillOutcome> {
  const decision = decidePrBackfill(storedVersion(), hasCompletedWorkout() ? 1 : 0);
  if (decision === 'skip') return 'skipped';
  if (decision === 'mark') {
    markDone();
    return 'marked';
  }

  // The settings the records are computed under, as finish and edit read them.
  const currentBw = await getBodyweightKg();
  const countWarmups = await getCountWarmups();

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Rows of an open transaction are not history yet.
    if (transactionOpen()) {
      await breathe(1000);
      continue;
    }
    const before = writesSoFar();
    const rows = await readSets();
    const kinds = new Map(
      db
        .select({ id: schema.exercises.id, kind: schema.exercises.kind })
        .from(schema.exercises)
        .all()
        .map((e) => [e.id, e.kind as 'weighted' | 'bodyweight']),
    );
    const prCounts = new Map(
      db
        .select({ id: schema.workouts.id, prCount: schema.workouts.prCount })
        .from(schema.workouts)
        .where(eq(schema.workouts.status, 'completed'))
        .all()
        .map((w) => [w.id, w.prCount]),
    );
    await breathe();

    // `planPrBackfill`, with the thread handed back between its steps.
    const histories = prHistories(rows, kinds, currentBw);
    await breathe();
    const walked = newPrWalkTally();
    let sliceStart = Date.now();
    for (const sessions of histories.values()) {
      tallyPrWalk(walked, sessions, countWarmups);
      if (Date.now() - sliceStart >= SLICE_MS) {
        await breathe();
        sliceStart = Date.now();
      }
    }
    await breathe();
    const plan = diffPrState(rows, prCounts, walked);
    await breathe();

    // From here to the commit is one synchronous stretch. If nothing has been
    // written since `before`, the plan was made from the database as it is now.
    if (transactionOpen() || writesSoFar() !== before) {
      await breathe(1000);
      continue;
    }
    writePlan(plan);
    return 'done';
  }
  return 'deferred';
}

/** One run per launch, however often the root layout mounts. */
let started = false;

/**
 * Starts the pass once the local database is ready and the first screen has
 * had its turn. Best-effort: it never reaches the UI, because the next launch
 * simply tries again — but a failure, or a pass put off, goes to the log.
 *
 * Screens that show PR pills read the database when they gain focus, and this
 * is done a few seconds into the first launch after the update, so History
 * and the exercise pages show the result as soon as they are next opened.
 */
export function usePrFlagBackfill(ready: boolean): void {
  useEffect(() => {
    if (!ready || started) return;
    const timer = setTimeout(() => {
      if (started) return;
      started = true;
      runPrBackfillIfOwed().then(
        (outcome) => {
          if (outcome === 'deferred') {
            console.warn('[prBackfill] deferred: other writes kept landing while it read; retrying next launch');
          }
        },
        (err) => {
          // Nothing was written and nothing was recorded; next launch retries.
          console.warn('[prBackfill] failed; retrying next launch', err);
        },
      );
    }, START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready]);
}
