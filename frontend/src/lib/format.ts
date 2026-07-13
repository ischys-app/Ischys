/** Presentation formatters for dashboard data. No external date libs. */

const WEEKDAY_UPPER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_TITLE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_TITLE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse an ISO string. Date-only (YYYY-MM-DD) is read in local time to avoid a UTC day-shift. */
/** Ends with `Z`, `+hh:mm`, `-hh:mm`, `+hhmm` or `-hhmm`. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parse(iso: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  // The API serialises naive UTC (SQLite drops the offset), and ECMAScript reads
  // an offset-less date-time as *local* — three hours out in Athens. Treat it as
  // UTC, which is what the server meant. Kept in step with lib/serverTime.ts;
  // this module stays import-free so `node --test` can run it.
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}Z`);
}

/** e.g. "WED · 8 JUL 2026" */
export function fmtHeaderDate(iso: string): string {
  const d = parse(iso);
  return `${WEEKDAY_UPPER[d.getDay()]} · ${d.getDate()} ${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`;
}

/** value + unit pair for the compact VOLUME stat. */
export function fmtVolumeShort(kg: number): { value: string; unit: string } {
  if (kg >= 1000) return { value: (kg / 1000).toFixed(1), unit: 'k kg' };
  return { value: String(Math.round(kg)), unit: ' kg' };
}

/** seconds → "H:MM" (e.g. 10080 → "2:48") */
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** thousands-separated kg (e.g. 9177 → "9,177 kg"). Manual grouping — Hermes'
 * Intl may omit the separator, so we don't rely on toLocaleString. */
export function fmtVolumeFull(kg: number): string {
  const grouped = String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped} kg`;
}

/** e.g. "Tue, 7 Jul · 09:06" */
export function fmtWorkoutDate(iso: string): string {
  const d = parse(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAY_TITLE[d.getDay()]}, ${d.getDate()} ${MONTH_TITLE[d.getMonth()]} · ${hh}:${mm}`;
}

/** e.g. "Tue, 7 Jul 2026" — Exercise Detail → History tab session header. */
export function fmtDateOnly(iso: string): string {
  const d = parse(iso);
  return `${WEEKDAY_TITLE[d.getDay()]}, ${d.getDate()} ${MONTH_TITLE[d.getMonth()]} ${d.getFullYear()}`;
}

/** Local midnight at the start of a given date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday of the ISO week that contains `d` (local time). */
export function startOfIsoWeek(d: Date): Date {
  const day = d.getDay(); // 0..6, 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  return monday;
}

/** Add `n` days to `d` (returns a new Date at local midnight). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Parse an ISO string as a local Date (mirrors internal parse()). */
export function parseIso(iso: string): Date {
  return parse(iso);
}

/** e.g. "Jan 2024" — Profile subtitle "training since …". Returns '' for null/blank. */
export function fmtMonthYear(iso?: string | null): string {
  if (!iso) return '';
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTH_TITLE[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Large-volume formatter for the Profile stats grid. Returns split value/unit so
 * the mono digits and the trailing unit can be styled independently.
 *   ≥ 1_000_000 → "1.84" / "M kg"
 *   ≥ 10_000    → "12.5" / "k kg"
 *   else        → "218"  / " kg"
 */
export function fmtVolumeLarge(kg: number): { value: string; unit: string } {
  if (kg >= 1_000_000) return { value: (kg / 1_000_000).toFixed(2), unit: 'M kg' };
  if (kg >= 10_000) return { value: (kg / 1000).toFixed(1), unit: 'k kg' };
  return { value: String(Math.round(kg)), unit: ' kg' };
}

/** Human label for a `RecordMetric` (records list on Profile / summary chips). */
export function metricLabel(metric: string): string {
  switch (metric) {
    case 'best_set':
      return 'Best Set';
    case 'est_1rm':
      return 'Est. 1RM';
    case 'best_volume':
      return 'Best Volume';
    case 'max_reps':
      return 'Max Reps';
    default:
      return metric;
  }
}

/**
 * Compact "time ago" string for the Settings screen (last-synced label).
 *   < 30s   → "just now"
 *   < 60m   → "Nm ago"
 *   < 24h   → "Nh ago"
 *   else    → "Nd ago"
 * Returns an empty string when `iso` is nullish or unparseable.
 */
export function fmtAgo(iso?: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const then = parse(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 30) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86_400)}d ago`;
}

/**
 * Friendly label for a Sync Frequency UI value (the 5-option picker).
 * Backend collapses the three intervals into a single `interval` enum, but the
 * user-facing Settings row still shows the exact granularity they picked.
 */
export function syncFreqUiLabel(v: string): string {
  switch (v) {
    case 'live':
      return 'Live';
    case 'i5':
      return 'Every 5 min';
    case 'i15':
      return 'Every 15 min';
    case 'i60':
      return 'Every hour';
    case 'manual':
      return 'Manual only';
    default:
      return 'Live';
  }
}

/**
 * History-tab group label for a workout date:
 *   - THIS WEEK / LAST WEEK for the two most-recent Mon-Sun weeks
 *   - otherwise the calendar month, e.g. "JUL 2026".
 */
export function fmtHistoryGroupTitle(workoutIso: string, now: Date = new Date()): string {
  const w = startOfDay(parse(workoutIso));
  const thisMon = startOfIsoWeek(startOfDay(now));
  const lastMon = addDays(thisMon, -7);
  if (w.getTime() >= thisMon.getTime()) return 'THIS WEEK';
  if (w.getTime() >= lastMon.getTime()) return 'LAST WEEK';
  return `${MONTH_UPPER[w.getMonth()]} ${w.getFullYear()}`;
}
