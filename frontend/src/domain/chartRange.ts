/**
 * Time ranges, training gaps and trend lines for the exercise charts (#67).
 *
 * The charts used to show a fixed count of recent sessions, which answers "what
 * did I do lately" and not "has this lift actually moved". These are the pieces
 * that make a real time axis readable: how far back a range reaches, how to draw
 * the space where someone didn't train, and whether the line is going anywhere.
 *
 * Pure, so `node --test` covers it.
 */

const DAY = 86400000;

export type ChartRangeId = '3M' | '6M' | '1Y' | 'ALL';

export const CHART_RANGES: { id: ChartRangeId; label: string; days: number | null }[] = [
  { id: '3M', label: '3M', days: 91 },
  { id: '6M', label: '6M', days: 182 },
  { id: '1Y', label: '1Y', days: 365 },
  { id: 'ALL', label: 'ALL', days: null },
];

/** Epoch ms to read from, or null for everything ever logged. */
export function rangeSince(range: ChartRangeId, now: number = Date.now()): number | null {
  const found = CHART_RANGES.find((r) => r.id === range);
  return found?.days == null ? null : now - found.days * DAY;
}

/**
 * How to draw the line between two sessions.
 *
 * A straight line across a three-month layoff claims a continuity that didn't
 * happen. Past three weeks the line goes dashed; past six, the gap gets a band
 * of its own, because at that point the break is the story of the chart.
 */
export type GapKind = 'none' | 'dashed' | 'band';

const DASH_AFTER_DAYS = 21;
const BAND_AFTER_DAYS = 42;

export function gapKind(gapMs: number): GapKind {
  const days = gapMs / DAY;
  if (days > BAND_AFTER_DAYS) return 'band';
  if (days > DASH_AFTER_DAYS) return 'dashed';
  return 'none';
}

/** Minimums below which a slope is noise dressed up as a finding. */
const MIN_POINTS_FOR_TREND = 4;
const MIN_SPAN_DAYS_FOR_TREND = 21;

/**
 * Least-squares slope over the points in range, in units per 30 days.
 *
 * Null when there isn't enough to say: fewer than four sessions, or sessions
 * squeezed into under three weeks, where a couple of good days reads as a
 * trend. The caller says "not enough sessions for a trend" rather than drawing
 * a confident line through noise.
 */
export function trendPerMonth(points: { t: number; value: number }[]): number | null {
  if (points.length < MIN_POINTS_FOR_TREND) return null;
  const times = points.map((p) => p.t);
  const span = Math.max(...times) - Math.min(...times);
  if (span < MIN_SPAN_DAYS_FOR_TREND * DAY) return null;

  // Work in days from the first point: raw epoch ms squared overflows the useful
  // precision of a double and the slope comes back as noise.
  const t0 = Math.min(...times);
  const xs = points.map((p) => (p.t - t0) / DAY);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 30;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type AxisTick = { label: string; pct: number };

/**
 * Ticks for the time axis, placed proportionally between the first and last
 * session.
 *
 * One label per session stopped working the moment the axis became time-based:
 * a year of training is fifty-odd dates in the space of a phone's width. Months
 * carry a year or less; ALL falls back to years, since it can span any length.
 */
export function axisTicks(times: number[], range: ChartRangeId): AxisTick[] {
  if (times.length < 2) return [];
  const first = times[0];
  const last = times[times.length - 1];
  const span = last - first;
  if (span <= 0) return [];

  const ticks: AxisTick[] = [];
  const start = new Date(first);
  if (range === 'ALL') {
    for (let y = start.getUTCFullYear(); y <= new Date(last).getUTCFullYear(); y += 1) {
      // The first tick anchors to the series start rather than to January, so a
      // series beginning mid-year doesn't push its own label off the left edge.
      const at = Math.max(first, Date.UTC(y, 0, 1));
      ticks.push({ label: String(y), pct: ((at - first) / span) * 100 });
    }
    return ticks;
  }

  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  while (true) {
    const at = Math.max(first, Date.UTC(y, m, 1));
    if (at > last) break;
    ticks.push({ label: MONTH_NAMES[m], pct: ((at - first) / span) * 100 });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return ticks;
}

/**
 * The tapped point, if the series still has one there.
 *
 * A chart keeps its selection as an index, and the series under it is replaced
 * when the range changes. An index past the end of a shorter series is no
 * point at all, and reading it took the whole screen down.
 */
export function selectionWithin(selected: number | null, count: number): number | null {
  if (selected == null || !Number.isInteger(selected)) return null;
  return selected >= 0 && selected < count ? selected : null;
}
