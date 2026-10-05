/**
 * Pure workout-CSV helpers (parse + serialize) — no DB, node --test-runnable.
 * A flat, one-row-per-set CSV that round-trips a full training history.
 */
import { normalizeRpe } from '../domain/effort.ts';
import { toKg, type Unit } from '../domain/units.ts';

export const CSV_COLUMNS = [
  'title', 'start_time', 'end_time', 'description', 'exercise_title', 'superset_id',
  'exercise_notes', 'set_index', 'set_type', 'weight_kg', 'reps',
  'distance_km', 'duration_seconds', 'rpe',
] as const;

const SET_TYPE_OUT: Record<string, string> = { warmup: 'warmup', drop: 'dropset', failure: 'failure', normal: 'normal' };
const SET_TYPE_IN: Record<string, string> = { warmup: 'warmup', dropset: 'drop', failure: 'failure', normal: 'normal' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse RFC-4180-ish CSV (quoted fields, embedded commas/newlines) into rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

/**
 * CSV timestamp -> epoch ms (local), or null. Accepts our own "10 Jul 2026, 09:00"
 * and the ISO-ish "2024-07-26 14:11:23" / "2024-07-26T14:11" / "2024-07-26" that
 * other trackers emit. Both are read as local wall-clock time, so an imported
 * workout keeps the date the exporting app displayed.
 */
export function parseCsvTime(v: string): number | null {
  const s = v.trim();
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2})/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2]);
    if (month < 0) return null;
    return new Date(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (iso) {
    return new Date(
      Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]),
      Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0),
    ).getTime();
  }
  return null;
}

/**
 * A workout duration -> seconds, or null. Accepts "24m", "1h 5m", "90s", "45 min"
 * and clock form ("45:00" as mm:ss, "1:05:30" as h:mm:ss).
 *
 * A bare number is deliberately rejected: exports disagree on whether it means
 * seconds or minutes, and either guess is wrong by 60x.
 */
export function parseCsvDuration(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (clock) {
    return clock[3] === undefined
      ? Number(clock[1]) * 60 + Number(clock[2])
      : Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  }
  const parts = /^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s)?$/.exec(s);
  if (parts && (parts[1] !== undefined || parts[2] !== undefined || parts[3] !== undefined)) {
    return Math.round(Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0));
  }
  return null;
}

const fmtCsvTime = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type ExportWorkout = {
  name: string;
  startedAt: number;
  endedAt: number | null;
  notes: string | null;
  exercises: {
    name: string;
    note: string | null;
    supersetGroup: number | null;
    sets: {
      position: number;
      type: string;
      weight: number | null;
      reps: number | null;
      /** Effort as RPE; written to the `rpe` column, blank when unrated. */
      rpe?: number | null;
    }[];
  }[];
};

/** Serialize workouts to a CSV string. */
export function toWorkoutCsv(workouts: ExportWorkout[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const w of workouts) {
    const start = fmtCsvTime(w.startedAt);
    const end = w.endedAt === null ? '' : fmtCsvTime(w.endedAt);
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        lines.push([
          w.name, start, end, w.notes ?? '', ex.name,
          ex.supersetGroup ?? '', ex.note ?? '', s.position, SET_TYPE_OUT[s.type] ?? 'normal',
          s.weight ?? '', s.reps ?? '', '', '', s.rpe ?? '',
        ].map(csvCell).join(','));
      }
    }
  }
  return lines.join('\n') + '\n';
}

export type ParsedWorkoutCsv = {
  workouts: {
    title: string;
    /**
     * False when the file named no workout — `title` is then the 'Workout'
     * fallback, which a genuinely untitled session must not be offered as a
     * routine name under.
     */
    titled: boolean;
    startedAt: number | null;
    endedAt: number | null;
    /** Seconds, or null when the file said nothing — which is not the same as zero. */
    durationSeconds: number | null;
    exercises: {
      title: string;
      superset: number | null;
      /** `rpe` is the set's effort rating, null when the file gave none. */
      sets: { type: string; weight: number | null; reps: number | null; rpe: number | null }[];
    }[];
  }[];
  rowsSkipped: number;
  /** True when the header stated its weight unit (`weight_kg` / `weight_lb`). */
  weightUnitKnown: boolean;
  /** True when no exercise-name column resolved, so nothing in the file is importable. */
  unmapped: boolean;
};

/**
 * Header aliases, in priority order. Other trackers export the same flat
 * one-row-per-set shape under different column names, so columns are matched on a
 * normalized header (case, spaces and punctuation stripped) rather than an exact
 * string. Our own CSV_COLUMNS names lead each list, so exports round-trip unchanged.
 */
const COLUMN_ALIASES = {
  title: ['title', 'workoutname', 'workout'],
  start: ['starttime', 'date', 'datetime'],
  end: ['endtime', 'enddate'],
  // Workout-level only. Our own set-level cardio column normalizes to
  // 'durationseconds', so it can never be mistaken for this one.
  duration: ['duration', 'workoutduration', 'totalduration'],
  exercise: ['exercisetitle', 'exercisename', 'exercise'],
  superset: ['supersetid', 'superset'],
  type: ['settype'],
  reps: ['reps'],
  rpe: ['rpe'],
} as const;

/** Weight columns, most specific first: a header that names its unit beats a bare `weight`. */
const WEIGHT_ALIASES: readonly (readonly [string, Unit | null])[] = [
  ['weightkg', 'kg'],
  ['weightkgs', 'kg'],
  ['weightlb', 'lb'],
  ['weightlbs', 'lb'],
  ['weightpounds', 'lb'],
  ['weight', null],
];

const normalizeHeader = (h: string): string => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

function resolveColumns(header: string[]) {
  const normed = header.map(normalizeHeader);
  const find = (aliases: readonly string[]): number => {
    for (const a of aliases) {
      const i = normed.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  let weight = -1;
  let statedUnit: Unit | null = null;
  for (const [alias, unit] of WEIGHT_ALIASES) {
    const i = normed.indexOf(alias);
    if (i >= 0) {
      weight = i;
      statedUnit = unit;
      break;
    }
  }
  return {
    title: find(COLUMN_ALIASES.title),
    start: find(COLUMN_ALIASES.start),
    end: find(COLUMN_ALIASES.end),
    duration: find(COLUMN_ALIASES.duration),
    exercise: find(COLUMN_ALIASES.exercise),
    superset: find(COLUMN_ALIASES.superset),
    type: find(COLUMN_ALIASES.type),
    reps: find(COLUMN_ALIASES.reps),
    rpe: find(COLUMN_ALIASES.rpe),
    weight,
    statedUnit,
  };
}

/**
 * Parse a workout CSV into structured workouts, grouped by workout (title + start)
 * then by exercise. `weightUnit` is only consulted when the header does not state a
 * unit — an explicit `weight_kg` column is always already canonical.
 */
export function parseWorkoutCsv(text: string, opts?: { weightUnit?: Unit }): ParsedWorkoutCsv {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { workouts: [], rowsSkipped: 0, weightUnitKnown: false, unmapped: true };
  }
  const idx = resolveColumns(rows[0]);
  const weightUnitKnown = idx.statedUnit !== null;
  // No exercise column means no row can become a set. Report that instead of
  // skipping all of them, which used to surface as a successful import of nothing.
  if (idx.exercise < 0) {
    return { workouts: [], rowsSkipped: rows.length - 1, weightUnitKnown, unmapped: true };
  }
  const unit: Unit = idx.statedUnit ?? opts?.weightUnit ?? 'kg';
  const byWorkout = new Map<string, ParsedWorkoutCsv['workouts'][number]>();
  let rowsSkipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const exTitle = (r[idx.exercise] ?? '').trim();
    if (!exTitle) { rowsSkipped++; continue; }
    const startRaw = (r[idx.start] ?? '').trim();
    // Some exports carry no workout-name column; an unnamed workout must not cost
    // the user the row.
    const rawTitle = (r[idx.title] ?? '').trim();
    const title = rawTitle || 'Workout';
    const key = `${title}@@${startRaw}`;
    let w = byWorkout.get(key);
    if (!w) {
      const startedAt = parseCsvTime(startRaw);
      // Prefer an explicit end time (our own export writes one, to the minute) and
      // fall back to a duration column. Every row of a workout repeats both.
      const endedAt = parseCsvTime((r[idx.end] ?? '').trim());
      const stated = parseCsvDuration((r[idx.duration] ?? '').trim());
      const spanned =
        endedAt !== null && startedAt !== null && endedAt >= startedAt
          ? Math.round((endedAt - startedAt) / 1000)
          : null;
      const durationSeconds = spanned ?? stated;
      w = {
        title,
        titled: rawTitle !== '',
        startedAt,
        endedAt: endedAt ?? (startedAt !== null && stated !== null ? startedAt + stated * 1000 : null),
        durationSeconds,
        exercises: [],
      };
      byWorkout.set(key, w);
    }
    const num = (v: string | undefined) => {
      if (v === undefined || v.trim() === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null; // non-numeric cell -> null, never NaN
    };
    let ex = w.exercises[w.exercises.length - 1];
    if (!ex || ex.title !== exTitle) {
      // A non-numeric superset_id (some tools use letters) must become null, not NaN.
      ex = { title: exTitle, superset: num(r[idx.superset]), sets: [] };
      w.exercises.push(ex);
    }
    ex.sets.push({
      type: SET_TYPE_IN[(r[idx.type] ?? '').trim()] ?? 'normal',
      weight: toKg(num(r[idx.weight]), unit),
      reps: num(r[idx.reps]),
      rpe: normalizeRpe(num(r[idx.rpe])),
    });
  }
  return { workouts: [...byWorkout.values()], rowsSkipped, weightUnitKnown, unmapped: false };
}

export type WorkoutCsvSummary = {
  workouts: number;
  exercises: number;
  sets: number;
  /** Sets with neither weight nor reps — cardio rows this importer cannot store. */
  cardioSkipped: number;
  rowsSkipped: number;
  weightUnitKnown: boolean;
  unmapped: boolean;
  firstWorkouts: { name: string; count: number }[];
};

/**
 * Preview counts for a workout CSV. Derived from the same parse the import runs, so
 * the preview cannot promise workouts the import will not write.
 */
export function summarizeWorkoutCsv(text: string, opts?: { weightUnit?: Unit }): WorkoutCsvSummary {
  const parsed = parseWorkoutCsv(text, opts);
  const exercises = new Set<string>();
  const firstWorkouts: { name: string; count: number }[] = [];
  let sets = 0;
  let cardioSkipped = 0;
  for (const w of parsed.workouts) {
    let count = 0;
    for (const ex of w.exercises) {
      exercises.add(ex.title);
      for (const s of ex.sets) {
        sets++;
        count++;
        const hasWeight = s.weight !== null && s.weight > 0;
        const hasReps = s.reps !== null && s.reps > 0;
        if (!hasWeight && !hasReps) cardioSkipped++;
      }
    }
    if (firstWorkouts.length < 5) firstWorkouts.push({ name: w.title, count });
  }
  return {
    workouts: parsed.workouts.length,
    exercises: exercises.size,
    sets,
    cardioSkipped,
    rowsSkipped: parsed.rowsSkipped,
    weightUnitKnown: parsed.weightUnitKnown,
    unmapped: parsed.unmapped,
    firstWorkouts,
  };
}
