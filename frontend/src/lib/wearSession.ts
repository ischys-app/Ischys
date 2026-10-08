/**
 * What a Wear OS watch's session measured, and which workout it belongs to.
 *
 * An Apple Watch saves its session to Apple Health itself, and the phone reads
 * the heart rate back from there. A Wear OS watch has no health store of its
 * own to save into, so as its session ends it sends the numbers to the phone
 * (`sessionMetrics`, see wear/.../ExerciseService.kt) and the phone keeps them:
 * the average and maximum heart rate on the workout, the energy on the entry
 * it writes to Health Connect.
 *
 * The message says when the session ran, not which workout it was for — the
 * Watch never knows the workout's id — so time decides it: a session belongs
 * to the workout it overlaps most.
 *
 * It can arrive at any point around the finish: a moment after it (the Watch
 * ends its session on hearing the finish worked), before it (the Watch gave up
 * waiting, or was out of reach and ended on its own), or at the next launch
 * (the app was not running). So it is both recorded here for a finish to wait
 * on, and applied on arrival by whoever listens (healthSync.ts).
 *
 * No imports and no native calls, so it runs under `npm test`.
 */

// Plausible human heart-rate bounds, as in healthSync.ts.
const HR_MIN = 20;
const HR_MAX = 250;

export type WearSession = {
  /** Epoch ms the Watch's session ran from and to. */
  startedAt: number;
  endedAt: number;
  /** Null when no heart rate was read, or what was read is not believable. */
  avgHr: number | null;
  maxHr: number | null;
  /** Kilocalories over the session; null when none were counted. */
  energyKcal: number | null;
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A `sessionMetrics` action as a session, or null when it is some other
 * action or not a usable one. The Watch sends 0 for a heart rate it never
 * read; an average above the maximum, or either outside what a heart does,
 * drops both rather than keeping half a reading.
 */
export function parseWearSession(a: Record<string, unknown>): WearSession | null {
  if (a.action !== 'sessionMetrics') return null;
  const { startedAt, endedAt, avgHr, maxHr, cal } = a;
  if (!finite(startedAt) || !finite(endedAt) || startedAt <= 0 || endedAt <= startedAt) return null;
  const hrOk =
    finite(avgHr) &&
    finite(maxHr) &&
    avgHr >= HR_MIN &&
    avgHr <= HR_MAX &&
    maxHr >= HR_MIN &&
    maxHr <= HR_MAX &&
    avgHr <= maxHr;
  return {
    startedAt,
    endedAt,
    avgHr: hrOk ? Math.round(avgHr) : null,
    maxHr: hrOk ? Math.round(maxHr) : null,
    energyKcal: finite(cal) && cal > 0 ? cal : null,
  };
}

/** How long the session and [startedAt, endedAt] ran at the same time, in ms. */
export function overlapMs(session: WearSession, startedAt: number, endedAt: number): number {
  return Math.max(0, Math.min(session.endedAt, endedAt) - Math.max(session.startedAt, startedAt));
}

export type WorkoutWindow = {
  id: string;
  startedAt: number;
  /** Null while the workout is still running. */
  endedAt: number | null;
};

/**
 * The workout a session was recorded for: the one it overlaps most, or null
 * when it overlaps none. A workout still running is taken to run until `now`.
 * The session must have spent most of its own length inside the workout —
 * otherwise a session left running by mistake, long after its workout, would
 * hand its numbers to whatever workout came next.
 */
export function workoutForSession(
  session: WearSession,
  workouts: readonly WorkoutWindow[],
  now: number,
): string | null {
  let best: { id: string; overlap: number } | null = null;
  for (const w of workouts) {
    const overlap = overlapMs(session, w.startedAt, w.endedAt ?? now);
    if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: w.id, overlap };
  }
  if (!best) return null;
  return best.overlap * 2 >= session.endedAt - session.startedAt ? best.id : null;
}

/**
 * The sessions heard so far, and the wait a finish makes for the one that is
 * its own. Only the most recent is kept: a finish asks about the workout that
 * has just ended.
 */
export function createWearSessionLog() {
  let latest: WearSession | null = null;
  // Installed by the finish that is waiting, so an arrival wakes it.
  let wake: (() => void) | null = null;

  const matching = (startedAt: number, endedAt: number): WearSession | null =>
    latest && overlapMs(latest, startedAt, endedAt) > 0 ? latest : null;

  return {
    note(session: WearSession): void {
      latest = session;
      wake?.();
    },

    /**
     * The session recorded over [startedAt, endedAt]: at once if it has
     * already arrived, otherwise when it does, or null after `waitMs`.
     */
    wait(startedAt: number, endedAt: number, waitMs: number): Promise<WearSession | null> {
      const have = matching(startedAt, endedAt);
      if (have) return Promise.resolve(have);
      return new Promise((resolve) => {
        let settled = false;
        const done = (found: WearSession | null) => {
          if (settled) return;
          settled = true;
          if (wake === woken) wake = null;
          clearTimeout(timer);
          resolve(found);
        };
        const woken = () => {
          const found = matching(startedAt, endedAt);
          if (found) done(found);
        };
        wake = woken;
        const timer = setTimeout(() => done(null), waitMs);
      });
    },
  };
}

/**
 * How long a finish waits for the Watch's numbers before writing the workout
 * to Health Connect without its energy. The Watch sends them as its session
 * ends, which it does on hearing the finish worked: a second or two.
 */
export const WEAR_SESSION_WAIT_MS = 6_000;

type ReadMetrics = { avgHr: number | null; maxHr: number | null; energyKcal: number | null };

/**
 * What was measured, from the Watch's own session where it has a number and
 * from the health store where it does not. The Watch's is the direct reading;
 * the store's is whatever some other app wrote over the same minutes.
 */
export function withWearSession(read: ReadMetrics, session: WearSession | null): ReadMetrics {
  if (!session) return read;
  const hr = session.avgHr != null && session.maxHr != null;
  return {
    avgHr: hr ? session.avgHr : read.avgHr,
    maxHr: hr ? session.maxHr : read.maxHr,
    energyKcal: session.energyKcal ?? read.energyKcal,
  };
}
