/**
 * Training-streak math (pure). Day streak → Home; week streak → Profile.
 *
 * A streak is "current" with a one-period grace: a rest day today doesn't break
 * a day streak that ran through yesterday, and an empty current week doesn't
 * break a week streak that ran through last week.
 *
 * Ported from backend/app/services/streak.py. Dates are JS `Date`s at local
 * midnight (the caller normalizes). Calendar arithmetic goes through
 * `new Date(y, m, d - n)` — never millisecond subtraction — so a DST transition
 * can't shift a day or week off by an hour. Pure and tested (see streak.test.ts).
 */

/** `YYYY-MM-DD` in local time — the identity of a calendar day. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** `d` shifted by `n` days, at local midnight. */
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Consecutive calendar days with ≥1 workout, ending today or yesterday. */
export function dayStreak(dates: Date[], today: Date): number {
  const days = new Set(dates.map(dayKey));
  let cursor: Date;
  if (days.has(dayKey(today))) {
    cursor = today;
  } else if (days.has(dayKey(addDays(today, -1)))) {
    cursor = addDays(today, -1);
  } else {
    return 0;
  }
  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

/**
 * ISO week-year and week number (Mon-based), matching Python's
 * `date.isocalendar()`. The Thursday of the week fixes the ISO year; the week
 * count is rounded off the gap to that year's first Thursday, so DST can't
 * nudge it. Returned as a `YYYY-Www` key for cheap set membership.
 */
function isoWeekKey(d: Date): string {
  // Thursday of this week decides the ISO year.
  const dow = (d.getDay() + 6) % 7; // 0 = Mon … 6 = Sun
  const thursday = addDays(d, 3 - dow);
  const isoYear = thursday.getFullYear();
  // Thursday of ISO week 1 (the week holding Jan 4).
  const jan4 = new Date(isoYear, 0, 4);
  const firstThursday = addDays(jan4, 3 - ((jan4.getDay() + 6) % 7));
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${`${week}`.padStart(2, '0')}`;
}

/** Consecutive ISO weeks with ≥1 workout, ending this week or last week. */
export function weekStreak(dates: Date[], today: Date): number {
  const weeks = new Set(dates.map(isoWeekKey));
  let cursor: Date;
  if (weeks.has(isoWeekKey(today))) {
    cursor = today;
  } else if (weeks.has(isoWeekKey(addDays(today, -7)))) {
    cursor = addDays(today, -7);
  } else {
    return 0;
  }
  let count = 0;
  while (weeks.has(isoWeekKey(cursor))) {
    count += 1;
    cursor = addDays(cursor, -7);
  }
  return count;
}
