/**
 * The read-only routine view (#85, board 15a): what a routine holds, and how it
 * went last time, shaped for the screen.
 *
 * Nothing here is editable and nothing is stored — it turns a routine plus the
 * most recent workout started from it into rows of plain text. Pure, so
 * `node --test` covers it; the queries live in data/routinesRepo.ts.
 */
import { groupLabels } from './supersets.ts';
import { type Unit, unitLabel, weightText } from './units.ts';

type SetType = 'normal' | 'warmup' | 'drop' | 'failure';
type ExerciseKind = 'weighted' | 'bodyweight';

/** One routine exercise, as the view needs it. Weights are kilograms. */
export type ViewExerciseIn = {
  id: string;
  exerciseId: string;
  name: string;
  initials: string;
  kind: ExerciseKind;
  equipment: string;
  restSeconds: number;
  supersetGroup: number | null;
  note: string | null;
  sets: readonly { type: SetType; weight: number | null; reps: number | null }[];
};

/** A set as it was logged in a past workout. Weight is kilograms. */
export type LoggedSet = { weight: number | null; reps: number | null; done: boolean };

/** One exercise of a past workout, sets in the order they were performed. */
export type LoggedExercise = { exerciseId: string; sets: readonly LoggedSet[] };

/**
 * Where an exercise's rest shows up. In a superset only the last partner rests,
 * once the round is over; the earlier ones hand straight to the next.
 */
export type ViewRest =
  | { kind: 'own'; seconds: number }
  | { kind: 'then'; tag: string }
  | { kind: 'afterRound'; seconds: number };

export type ViewSet = {
  key: string;
  type: SetType;
  /** Working-set number, or W / D / F. */
  badge: string;
  target: string;
  /** What was done last time; blank when nothing matches. */
  last: string;
};

export type ViewCard = {
  key: string;
  exerciseId: string;
  name: string;
  initials: string;
  equipment: string;
  rest: ViewRest;
  /** "A1" — place in a superset. Null when solo. */
  tag: string | null;
  note: string | null;
  /** "KG" / "LB", with a "+" for bodyweight movements (added load). */
  unitLabel: string;
  sets: ViewSet[];
};

export type ViewBlock = {
  key: string;
  /** Present on a superset: "SUPERSET A" and "· 3 ROUNDS". */
  group: { label: string; sub: string } | null;
  cards: ViewCard[];
};

const DASH = '—';
const MINUS = '−';
const FIVE_MINUTES = 300;

/** "6 EXERCISES · 18 SETS". An empty routine has no sets to count. */
export function routineCountsLabel(exerciseCount: number, setCount: number): string {
  const exercises = `${exerciseCount} ${exerciseCount === 1 ? 'EXERCISE' : 'EXERCISES'}`;
  if (exerciseCount === 0) return exercises;
  return `${exercises} · ${setCount} ${setCount === 1 ? 'SET' : 'SETS'}`;
}

/**
 * Roughly how long the routine takes: the median of its last three runs,
 * rounded to five minutes. Null until it has been done once.
 *
 * The median, not the mean, so the one session where Finish was forgotten does
 * not turn an hour into four. `durations` is newest first, in seconds; a run
 * with no recorded length says nothing and is skipped.
 */
export function estimateDurationSeconds(durations: readonly number[]): number | null {
  const recent = durations
    .filter((d) => d > 0)
    .slice(0, 3)
    .sort((a, b) => a - b);
  if (recent.length === 0) return null;
  const mid = Math.floor(recent.length / 2);
  const median = recent.length % 2 === 1 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  return Math.max(FIVE_MINUTES, Math.round(median / FIVE_MINUTES) * FIVE_MINUTES);
}

/**
 * "60 × 8" — a target or a logged set, in the user's unit. The column header
 * names the unit, so the cell does not. A missing value is a dash; a bodyweight
 * movement reads "BW", or its added load as "+10".
 */
export function setText(
  kind: ExerciseKind,
  weightKg: number | null,
  reps: number | null,
  unit: Unit,
): string {
  const repsText = reps == null ? DASH : String(reps);
  let load: string;
  if (kind === 'bodyweight') {
    if (weightKg == null || weightKg === 0) load = 'BW';
    else if (weightKg > 0) load = `+${weightText(weightKg, unit)}`;
    else load = `${MINUS}${weightText(-weightKg, unit)}`;
  } else {
    load = weightKg == null ? DASH : weightText(weightKg, unit);
  }
  return `${load} × ${repsText}`;
}

/**
 * Line each routine set up with the set done last time: same exercise, same
 * place in the order. Returns one row per routine exercise, one entry per set,
 * null where there is nothing to show — the exercise was not in that workout,
 * it had fewer sets, or the set was never ticked.
 *
 * An exercise that appears twice in the routine matches its own occurrence, so
 * the second block of bench does not read the first one's numbers.
 */
export function matchLastSets(
  routine: readonly ViewExerciseIn[],
  last: readonly LoggedExercise[] | null,
): (LoggedSet | null)[][] {
  const seen = new Map<string, number>();
  return routine.map((ex) => {
    const nth = seen.get(ex.exerciseId) ?? 0;
    seen.set(ex.exerciseId, nth + 1);
    const logged = last?.filter((l) => l.exerciseId === ex.exerciseId)[nth];
    return ex.sets.map((_, i) => {
      const s = logged?.sets[i];
      if (!s || !s.done || (s.weight == null && s.reps == null)) return null;
      return s;
    });
  });
}

const BADGE: Record<Exclude<SetType, 'normal'>, string> = { warmup: 'W', drop: 'D', failure: 'F' };

/** "dumbbell" -> "Dumbbell". Equipment is stored as a lowercase slug. */
function titleCase(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * The routine as blocks of cards: a solo exercise is a block of one, superset
 * partners that sit together share a block under one label and rail.
 */
export function buildRoutineView(
  routine: readonly ViewExerciseIn[],
  last: readonly LoggedExercise[] | null,
  unit: Unit,
): ViewBlock[] {
  const lastSets = matchLastSets(routine, last);

  // A group of one is not a superset, so it is drawn as an ordinary exercise.
  const partnersOf = (group: number | null) =>
    group == null ? [] : routine.filter((e) => e.supersetGroup === group);
  const grouped = routine.map((e) =>
    partnersOf(e.supersetGroup).length >= 2 ? e.supersetGroup : null,
  );
  const letters = groupLabels(
    routine.map((e, i) => ({ id: e.id, supersetGroup: grouped[i], rest: e.restSeconds, sets: [] })),
  );

  const blocks: ViewBlock[] = [];
  const labelled = new Set<number>();

  routine.forEach((ex, i) => {
    const group = grouped[i];
    const partners = partnersOf(group);
    const letter = group == null ? null : (letters.get(group) ?? null);
    const place = partners.findIndex((p) => p.id === ex.id);

    let rest: ViewRest = { kind: 'own', seconds: ex.restSeconds };
    if (letter) {
      rest =
        place === partners.length - 1
          ? { kind: 'afterRound', seconds: ex.restSeconds }
          : { kind: 'then', tag: `${letter}${place + 2}` };
    }

    let working = 0;
    const card: ViewCard = {
      key: ex.id,
      exerciseId: ex.exerciseId,
      name: ex.name,
      initials: ex.initials,
      equipment: titleCase(ex.equipment),
      rest,
      tag: letter ? `${letter}${place + 1}` : null,
      note: ex.note && ex.note.trim().length > 0 ? ex.note.trim() : null,
      unitLabel: ex.kind === 'bodyweight' ? `+${unitLabel(unit)}` : unitLabel(unit),
      sets: ex.sets.map((s, j) => {
        const logged = lastSets[i][j];
        return {
          key: `${ex.id}-${j}`,
          type: s.type,
          badge: s.type === 'normal' ? String(++working) : BADGE[s.type],
          target: setText(ex.kind, s.weight, s.reps, unit),
          last: logged ? setText(ex.kind, logged.weight, logged.reps, unit) : '',
        };
      }),
    };

    const prev = blocks[blocks.length - 1];
    if (group != null && i > 0 && grouped[i - 1] === group && prev) {
      prev.cards.push(card);
      return;
    }

    let header: ViewBlock['group'] = null;
    if (group != null && letter) {
      // Rounds count working sets, as they do during the workout.
      const rounds = Math.max(
        ...partners.map((p) => p.sets.filter((s) => s.type === 'normal').length),
      );
      // Partners split apart by another exercise still share one label: it sits
      // on the first run, and the later ones keep only the rail and their tags.
      header = labelled.has(group)
        ? { label: `SUPERSET ${letter}`, sub: '' }
        : { label: `SUPERSET ${letter}`, sub: `· ${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}` };
      labelled.add(group);
    }
    blocks.push({ key: ex.id, group: header, cards: [card] });
  });

  return blocks;
}
