/**
 * Pure workout-CSV helpers (parse + serialize) — no DB, node --test-runnable.
 * A flat, one-row-per-set CSV that round-trips a full training history.
 */
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

/** CSV timestamp "10 Jul 2026, 09:00" -> epoch ms (local), or null. */
export function parseCsvTime(v: string): number | null {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s+(\d{1,2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]);
  if (month < 0) return null;
  return new Date(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
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
    sets: { position: number; type: string; weight: number | null; reps: number | null }[];
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
          s.weight ?? '', s.reps ?? '', '', '', '',
        ].map(csvCell).join(','));
      }
    }
  }
  return lines.join('\n') + '\n';
}

export type ParsedWorkoutCsv = {
  workouts: {
    title: string;
    startedAt: number | null;
    exercises: {
      title: string;
      superset: number | null;
      sets: { type: string; weight: number | null; reps: number | null }[];
    }[];
  }[];
  rowsSkipped: number;
};

/** Parse a workout CSV into structured workouts (grouped by title+start_time, then exercise). */
export function parseWorkoutCsv(text: string): ParsedWorkoutCsv {
  const rows = parseCsv(text);
  if (rows.length === 0) return { workouts: [], rowsSkipped: 0 };
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    title: col('title'), start: col('start_time'), exercise: col('exercise_title'),
    superset: col('superset_id'), type: col('set_type'), weight: col('weight_kg'), reps: col('reps'),
  };
  const byWorkout = new Map<string, ParsedWorkoutCsv['workouts'][number]>();
  let rowsSkipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const title = (r[idx.title] ?? '').trim();
    const startRaw = (r[idx.start] ?? '').trim();
    const exTitle = (r[idx.exercise] ?? '').trim();
    if (!title || !exTitle) { rowsSkipped++; continue; }
    const key = `${title}@@${startRaw}`;
    let w = byWorkout.get(key);
    if (!w) {
      w = { title, startedAt: parseCsvTime(startRaw), exercises: [] };
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
      weight: num(r[idx.weight]),
      reps: num(r[idx.reps]),
    });
  }
  return { workouts: [...byWorkout.values()], rowsSkipped };
}
