/**
 * In-memory data model for the Active Workout screen.
 *
 * Weights here are raw input strings in the *user's unit* — exactly what the
 * field shows. They are converted to kilograms where they leave for storage
 * (domain/units.ts `inputToKg`) and from kilograms where they are loaded
 * (`weightText`); the screen tracks which unit the strings are currently in.
 */
import { type Unit, unitLabel } from '../../domain/units';
import { color } from '../../theme/tokens';

export type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

export interface WorkoutSet {
  id: string;
  type: SetType;
  /** Current entered weight, in the user's unit, as a raw input string. Empty when unlogged. */
  weight: string;
  /** Current entered reps, as a raw input string. Empty when unlogged. */
  reps: string;
  /** Previous-session weight, in the user's unit. Undefined for bodyweight or first-ever set. */
  prevWeight?: string;
  /** Previous-session reps. */
  prevReps?: string;
  done: boolean;
  /** This set's effort, always as RPE (domain/effort.ts). Unset when unrated. */
  rpe?: number | null;
  /** The same set's effort last session. */
  prevRpe?: number | null;
}

export interface Exercise {
  id: string;
  /** Catalog exercise id (distinct from the workout_exercise id in `id`). */
  exerciseCatalogId?: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
  /** Shared by exercises trained as a superset. Null for an ordinary one. */
  supersetGroup?: number | null;
  /** Rest duration in seconds. */
  rest: number;
  note: string;
  /** Previous session's note, shown as a placeholder when `note` is empty. */
  notePlaceholder?: string;
  sets: WorkoutSet[];
}

/** Set-type → badge color + row tint. */
export const typeMeta: Record<SetType, { color: string; tintBg: string }> = {
  normal: { color: color.text2, tintBg: 'transparent' },
  warmup: { color: color.warning, tintBg: 'rgba(255,194,75,0.10)' },
  drop: { color: '#4C8DFF', tintBg: 'rgba(76,141,255,0.10)' },
  failure: { color: color.error, tintBg: 'rgba(255,77,77,0.10)' },
};

export const TYPE_CYCLE: SetType[] = ['normal', 'warmup', 'drop', 'failure'];

export interface RestOption {
  label: string;
  seconds: number;
}

export const REST_OPTIONS: RestOption[] = [
  { label: 'Off', seconds: 0 },
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2:00', seconds: 120 },
  { label: '2:30', seconds: 150 },
  { label: '3:00', seconds: 180 },
  { label: '3:30', seconds: 210 },
  { label: '4:00', seconds: 240 },
  { label: '5:00', seconds: 300 },
];

/** mm:ss (or h:mm:ss) for elapsed time. */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** m:ss for a rest countdown. */
export function fmtRest(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Human label for a rest duration, matching the picker options. */
export function restLabel(seconds: number): string {
  const opt = REST_OPTIONS.find((o) => o.seconds === seconds);
  if (opt) return opt.label;
  if (seconds <= 0) return 'Off';
  return fmtRest(seconds);
}

/** "Dumbbell · 150s rest". */
export function exerciseMeta(ex: Exercise): string {
  return `${ex.equipment} · ${ex.rest}s rest`;
}

/** Weight-column header label, e.g. "KG" / "LB", or "+KG" / "+LB" (bodyweight). */
export function weightColumnLabel(ex: Exercise, unit: Unit): string {
  return ex.kind === 'bodyweight' ? `+${unitLabel(unit)}` : unitLabel(unit);
}

export { prevLabel } from './prevLabel';

/**
 * A set's badge: the working-set number for a normal set, the type's letter
 * otherwise. The same glyph the row draws, for anything that names a set
 * ("SET 3").
 */
export function setBadge(sets: readonly { type: SetType }[], index: number): string {
  const type = sets[index]?.type ?? 'normal';
  if (type === 'warmup') return 'W';
  if (type === 'drop') return 'D';
  if (type === 'failure') return 'F';
  let working = 0;
  for (let i = 0; i <= index && i < sets.length; i++) if (sets[i].type === 'normal') working += 1;
  return String(working);
}

let _seq = 0;
const uid = (p: string) => `${p}-${_seq++}`;

function mkSet(
  type: SetType,
  weight: string,
  reps: string,
  prevWeight: string | undefined,
  prevReps: string | undefined,
  done: boolean,
): WorkoutSet {
  return { id: uid('set'), type, weight, reps, prevWeight, prevReps, done };
}

/** Seed that renders the screen like the design. */
export function seedWorkout(): Exercise[] {
  return [
    {
      id: uid('ex'),
      name: 'Incline Bench Press (Dumbbell)',
      initials: 'IB',
      equipment: 'Dumbbell',
      kind: 'weighted',
      rest: 150,
      note: '',
      sets: [
        mkSet('warmup', '32', '10', '30', '10', true),
        mkSet('warmup', '32', '8', '30', '8', true),
        mkSet('normal', '60', '8', '58', '8', true),
        mkSet('normal', '60', '8', '58', '8', true),
        mkSet('normal', '60', '', '58', '6', false),
        mkSet('normal', '', '', '65', '5', false),
      ],
    },
    {
      id: uid('ex'),
      name: 'Pull Up',
      initials: 'PU',
      equipment: 'Bodyweight',
      kind: 'bodyweight',
      rest: 150,
      note: '',
      sets: [
        mkSet('normal', '', '', undefined, '11', false),
        mkSet('normal', '', '', undefined, '11', false),
        mkSet('normal', '', '', undefined, '7', false),
      ],
    },
    {
      id: uid('ex'),
      name: 'Shoulder Press (Machine Plates)',
      initials: 'SP',
      equipment: 'Machine',
      kind: 'weighted',
      rest: 90,
      note: '',
      sets: [
        mkSet('normal', '', '', '42.5', '8', false),
        mkSet('normal', '', '', '42.5', '8', false),
        mkSet('normal', '', '', '42.5', '8', false),
      ],
    },
  ];
}

/** Fresh normal set for + Add Set (copies prior set's prev refs). */
export function makeSet(prevWeight?: string, prevReps?: string): WorkoutSet {
  return { id: uid('set'), type: 'normal', weight: '', reps: '', prevWeight, prevReps, done: false };
}
