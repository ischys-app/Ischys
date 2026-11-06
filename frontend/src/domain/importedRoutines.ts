/**
 * Routines from imported history (board 12a).
 *
 * An import restores *sessions*, not routines — neither a workout CSV nor an
 * Ischys JSON backup carries the plans the user trains from. This module turns
 * the sessions one import created into the pick list the success screen offers,
 * and formats every string on it.
 *
 * It is deliberately pure: the screen under `app/` isn't reachable from the test
 * runner, so the grouping, the sort, the collapse rule and the labels all live
 * here where they can be tested.
 */
import type { ImportedSession } from '../api/types.ts';
import { getLang } from '../i18n/current.ts';
import { t } from '../i18n/t.ts';
import { fmtCardDay, fmtDayMonthOf } from '../lib/format.ts';

/** One title the user can turn into a routine. */
export type RoutineCandidate = {
  /** The grouping key — case- and whitespace-insensitive. Not for display. */
  key: string;
  /** Display name: the spelling of the most recent session, trimmed. */
  name: string;
  /** The session the routine would be built from — the most recent one. */
  workoutId: string;
  /** How many imported sessions carry this title. */
  sessions: number;
  /** Exercises in the most recent session, i.e. in the routine that would be created. */
  exerciseCount: number;
  /** Epoch ms of the most recent session. */
  lastTrainedAt: number;
};

/**
 * Below this many titles nothing collapses — a short list is already scannable,
 * and hiding one of four rows costs more than it saves.
 */
export const COLLAPSE_MIN_TITLES = 6;

/**
 * A date within this many days of the newest imported session is shown brighter.
 * Information, not a judgement: it is the only hint the screen gives about which
 * titles are current. A starting value, open for product.
 */
export const RECENT_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/**
 * The grouping key. "Temp lower" and "  Temp   Lower " are one routine, because a
 * user retyping a title between sessions didn't mean to create a second plan.
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Group an import's sessions into one candidate per title, sorted for display.
 *
 * Sorted by last trained, newest first — not by session count, which cannot tell
 * a routine from a scratch name ("Temp Upper" has 12 sessions and was last
 * trained in March). Ties go to the title with more sessions, then to the name so
 * the order never depends on row order in the file.
 *
 * Untitled sessions are dropped: there is no name to offer.
 */
export function groupImportedRoutines(sessions: ImportedSession[]): RoutineCandidate[] {
  const byKey = new Map<string, RoutineCandidate>();
  for (const s of sessions) {
    const key = normalizeTitle(s.title);
    if (key === '') continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        name: s.title.trim(),
        workoutId: s.workout_id,
        sessions: 1,
        exerciseCount: s.exercise_count,
        lastTrainedAt: s.started_at,
      });
      continue;
    }
    existing.sessions++;
    // Strictly newer only, so sessions sharing a timestamp keep file order.
    if (s.started_at > existing.lastTrainedAt) {
      existing.name = s.title.trim();
      existing.workoutId = s.workout_id;
      existing.exerciseCount = s.exercise_count;
      existing.lastTrainedAt = s.started_at;
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      b.lastTrainedAt - a.lastTrainedAt ||
      b.sessions - a.sessions ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Split the candidates into the rows shown and the ones hidden behind the
 * "N MORE · SEEN ONCE" row. A title trained once is the weakest evidence of a
 * routine, so on a long list those fold away.
 *
 * A one-off that was trained *recently* is kept visible. The list sorts on
 * recency, so collapsing purely on session count contradicted it: someone who
 * switched apps mid-programme had the thing they actually train now folded away
 * beneath months-old titles. Weak evidence and stale evidence are different
 * things, and only the second is worth hiding.
 *
 * Collapsing is skipped when it would empty the list: an import of nothing but
 * one-off titles should still show them, not a single row to expand.
 */
export function splitSeenOnce(candidates: RoutineCandidate[]): {
  rows: RoutineCandidate[];
  seenOnce: RoutineCandidate[];
} {
  if (candidates.length < COLLAPSE_MIN_TITLES) return { rows: candidates, seenOnce: [] };
  const newestAt = candidates.reduce((m, c) => Math.max(m, c.lastTrainedAt), 0);
  const keep = (c: RoutineCandidate) =>
    c.sessions > 1 || isRecentlyTrained(c.lastTrainedAt, newestAt);
  const rows = candidates.filter(keep);
  if (rows.length === 0) return { rows: candidates, seenOnce: [] };
  return { rows, seenOnce: candidates.filter((c) => !keep(c)) };
}

/** `56 SESSIONS · 6 EXERCISES` — mono, tabular, under the name. */
export function routineCandidateMeta(c: RoutineCandidate): string {
  return `${t('import.sessions', { count: c.sessions })} · ${t('import.exercisesMeta', { count: c.exerciseCount })}`;
}

/**
 * `28 SEP`, or `03 AUG 25` when the row is from a different year than the newest
 * session in the import. Local time, since the user trained locally.
 *
 * The year is not decoration. A real import listed "New upper · 03 AUG" (2025)
 * below "Lower & Core · 23 JUN" (2026): sorted correctly, but a day and a month
 * alone read as the more recent of the two. A list ordered by date has to say
 * which dates these are.
 */
export function lastTrainedLabel(ms: number, newestAt: number): string {
  const d = new Date(ms);
  if (getLang() === 'zh-Hans') {
    return d.getFullYear() === new Date(newestAt).getFullYear() ? fmtDayMonthOf(d) : fmtCardDay(d);
  }
  const day = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
  const year = d.getFullYear();
  if (year === new Date(newestAt).getFullYear()) return day;
  return `${day} ${String(year % 100).padStart(2, '0')}`;
}

/** Whether a row's date gets the brighter colour. `newestAt` is the newest import. */
export function isRecentlyTrained(lastTrainedAt: number, newestAt: number): boolean {
  return newestAt - lastTrainedAt <= RECENT_WINDOW_DAYS * DAY_MS;
}

/** `10 TITLES` — the list header, left. */
export function titlesHeaderLabel(count: number): string {
  return t('import.titles', { count });
}

/** `2 MORE · SEEN ONCE` — the collapsed row. */
export function seenOnceLabel(count: number): string {
  return t('import.seenOnce', { count });
}

/**
 * The single accent button. `Done` with nothing picked — the screen is finished
 * either way, so skipping never needs a second control.
 */
export function createRoutinesLabel(picked: number): string {
  if (picked === 0) return t('common.done');
  return t('import.createRoutines', { count: picked });
}

/**
 * `Created 4 of 5 · Push failed`, shown under the button with Retry. Nothing is
 * rolled back: the routines that landed are still what the user asked for.
 */
export function partialFailureNote(
  created: number,
  attempted: number,
  failedNames: string[],
): string | null {
  if (failedNames.length === 0) return null;
  return t('import.partialFail', { created, attempted, names: failedNames.join(', ') });
}

/**
 * A free routine name, suffixed rather than overwriting. Creating a routine must
 * never destroy one the user already has, and a silent second "Upper" is its own
 * kind of loss — you can't tell them apart in a list.
 */
export function uniqueRoutineName(desired: string, taken: Iterable<string>): string {
  const base = desired.trim();
  const used = new Set<string>();
  for (const t of taken) used.add(normalizeTitle(t));
  if (!used.has(normalizeTitle(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`;
    if (!used.has(normalizeTitle(candidate))) return candidate;
  }
}
