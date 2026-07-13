/**
 * Weekly workout-count bars for the Profile tab — the last `WEEK_BARS` ISO weeks
 * of the current year, oldest → newest, with the current week last.
 *
 * Pure and tested (see weeklyBars.test.ts). The week arithmetic counts weeks by
 * *rounding* the millisecond gap between two local-midnight Mondays, never
 * flooring it: a DST transition earlier in the year makes the real elapsed time
 * an hour short of a whole number of weeks, and flooring then drops every
 * workout one bucket early — leaving the current week permanently empty.
 */
export const WEEK_BARS = 26;

/** A month label anchored to a bar index, for the chart's time axis. */
export type AxisTick = { index: number; label: string };

export type WeeklyBars = {
  counts: number[];
  avg: number;
  max: number;
  /** Month labels marking where each new month begins along the bars. */
  ticks: AxisTick[];
};

type DatedWorkout = { started_at: string };

const WEEK_MS = 7 * 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Date helpers are inlined (not imported from ./format) so this module stays
// self-contained and `node --test` can run it — the same reason format.ts is
// kept import-free. Behaviour must match format.ts's versions.
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Parse the API's naive-UTC timestamp; offset-less strings are read as UTC. */
function parseIso(iso: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}Z`);
}

/** Local midnight at the start of `d`. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday of the ISO week containing `d` (local time). */
function startOfIsoWeek(d: Date): Date {
  const diff = (d.getDay() + 6) % 7; // days since Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

/** `d` shifted by `n` days, at local midnight. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Whole weeks between two local-midnight Mondays, DST-proof (see file header). */
function weeksBetween(fromMon: Date, toMon: Date): number {
  return Math.round((toMon.getTime() - fromMon.getTime()) / WEEK_MS);
}

export function buildWeeklyBars(
  workouts: DatedWorkout[],
  now: Date = new Date(),
): WeeklyBars {
  const firstWeekMon = startOfIsoWeek(new Date(now.getFullYear(), 0, 1));
  const thisWeekMon = startOfIsoWeek(startOfDay(now));
  const weeksSoFar = weeksBetween(firstWeekMon, thisWeekMon) + 1;
  const shown = Math.min(WEEK_BARS, Math.max(1, weeksSoFar));
  const startMon = addDays(thisWeekMon, -(shown - 1) * 7);

  const counts = Array(shown).fill(0) as number[];
  for (const w of workouts) {
    const wDate = parseIso(w.started_at);
    if (wDate.getFullYear() !== now.getFullYear()) continue;
    const idx = weeksBetween(startMon, startOfIsoWeek(startOfDay(wDate)));
    if (idx < 0 || idx >= shown) continue;
    counts[idx] += 1;
  }

  // Left-pad to WEEK_BARS so the render always shows a full set of columns,
  // newest on the right.
  const pad = Math.max(0, WEEK_BARS - counts.length);
  const padded = (Array(pad).fill(0) as number[]).concat(counts);

  // Month axis: one tick at the first real bar and again wherever the month
  // rolls over, so the bars read against a calendar. Indices are into `padded`.
  const ticks: AxisTick[] = [];
  let prevMonth = -1;
  for (let i = 0; i < shown; i++) {
    const month = addDays(startMon, i * 7).getMonth();
    if (month !== prevMonth) {
      ticks.push({ index: pad + i, label: MONTHS[month] });
      prevMonth = month;
    }
  }

  const active = padded.filter((n) => n > 0);
  const avg = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  const max = padded.reduce((a, b) => Math.max(a, b), 0);
  return { counts: padded, avg, max, ticks };
}
