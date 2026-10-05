/**
 * Editing a finished workout (#83, board 13a), as a pure model.
 *
 * A live workout writes every keystroke. History needs an exit that leaves no
 * trace, so an edit lives here, in memory, until Save: the workout as it was
 * stored (`original`, kilograms), a working copy in the user's unit, and
 * everything derived from comparing the two — whether anything changed, what
 * each set "was", which records move, and the plan of writes that Save applies
 * in one transaction (data/workoutEditRepo.ts).
 *
 * Two rules everything here protects:
 * - A value the user did not touch is saved back as the kilograms it was
 *   stored as, never as its display text converted again. 100 kg shows as
 *   220.46 lb, and 220.46 lb is 99.9989 kg.
 * - Imports dedupe on (name, started_at). The name is never written, and
 *   `started_at` only when the user moved the date or the start time.
 *
 * Pure — its imports are pure too — so `node --test` covers it.
 */
import type { RecordMetric } from '../api/types.ts';
import { computeRecords, recordDisplay, type PRSession, type PRSet, type RecordValue } from './records.ts';
import { groupLabels } from './supersets.ts';
import { parseWeight, toDisplay, toKg, weightText, type Unit } from './units.ts';

export type EditSetType = 'normal' | 'warmup' | 'drop' | 'failure';

const TYPE_CYCLE: EditSetType[] = ['normal', 'warmup', 'drop', 'failure'];
const TYPE_WORD: Record<EditSetType, string> = {
  normal: 'normal',
  warmup: 'warm-up',
  drop: 'drop',
  failure: 'failure',
};

// --- the workout as stored ---------------------------------------------------

export type OriginalSet = {
  id: string;
  type: EditSetType;
  /** Kilograms. For a bodyweight movement, the added load. */
  weight: number | null;
  reps: number | null;
  done: boolean;
  /** Carried so nothing here can lose it; never edited on this screen. */
  rpe: number | null;
  /** Stored position. Defaults to the set's index. */
  position?: number;
};

export type OriginalExercise = {
  /** The workout_exercise id. */
  id: string;
  /** The catalog exercise id. */
  exerciseId: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
  rest: number;
  note: string;
  supersetGroup: number | null;
  sets: OriginalSet[];
  /** Stored position. Defaults to the exercise's index. */
  position?: number;
};

export type OriginalWorkout = {
  id: string;
  name: string;
  /** Epoch ms. */
  startedAt: number;
  durationSeconds: number;
  endedAt: number | null;
  exercises: OriginalExercise[];
};

// --- the working copy --------------------------------------------------------

/** A set as the row shows it: raw input strings, in the session's unit. */
export type EditSet = {
  id: string;
  type: EditSetType;
  weight: string;
  reps: string;
  done: boolean;
  /**
   * On an added set whose weight was copied down from the set above: the
   * kilograms that text stands for, so a copy of 100 kg shown as 220.46 lb is
   * saved as 100 kg. Ignored once the text no longer reads as that weight.
   */
  carriedKg?: number | null;
};

/** Shaped so the workout's `ExerciseCard` can render it as it is. */
export type EditExercise = {
  id: string;
  exerciseCatalogId: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
  rest: number;
  note: string;
  supersetGroup: number | null;
  sets: EditSet[];
  /** Collapsed, where it stands, to a dashed row with Undo. Gone on Save. */
  removed: boolean;
};

export type EditSession = {
  original: OriginalWorkout;
  /** The unit every weight string in `exercises` is written in. */
  unit: Unit;
  startedAt: number;
  durationSeconds: number;
  exercises: EditExercise[];
};

export type ChosenExercise = {
  id: string;
  name: string;
  initials: string;
  equipment: string;
  kind: 'weighted' | 'bodyweight';
};

const DEFAULT_REST = 120;

/**
 * A stored weight as its field shows it. A bodyweight movement's weight is a
 * load added to the mover, so a positive one reads "+10", as on the board —
 * and `parseWeight` reads "+10" as 10, so it is still the stored value.
 */
function fieldWeight(kind: 'weighted' | 'bodyweight', weightKg: number | null, unit: Unit): string {
  const text = weightText(weightKg, unit);
  return kind === 'bodyweight' && weightKg != null && weightKg > 0 ? `+${text}` : text;
}

export function openEditSession(original: OriginalWorkout, unit: Unit): EditSession {
  return {
    original,
    unit,
    startedAt: original.startedAt,
    durationSeconds: original.durationSeconds,
    exercises: original.exercises.map((ex) => ({
      id: ex.id,
      exerciseCatalogId: ex.exerciseId,
      name: ex.name,
      initials: ex.initials,
      equipment: ex.equipment,
      kind: ex.kind,
      rest: ex.rest,
      note: ex.note,
      supersetGroup: ex.supersetGroup,
      removed: false,
      sets: ex.sets.map((s) => ({
        id: s.id,
        type: s.type,
        weight: fieldWeight(ex.kind, s.weight, unit),
        reps: s.reps == null ? '' : String(s.reps),
        done: s.done,
      })),
    })),
  };
}

// --- edits -------------------------------------------------------------------

const blankSet = (id: string): EditSet => ({ id, type: 'normal', weight: '', reps: '', done: true });

const mapExercise = (
  s: EditSession,
  exId: string,
  fn: (ex: EditExercise) => EditExercise,
): EditSession => ({ ...s, exercises: s.exercises.map((e) => (e.id === exId ? fn(e) : e)) });

const mapSet = (
  s: EditSession,
  exId: string,
  setId: string,
  fn: (set: EditSet) => EditSet,
): EditSession =>
  mapExercise(s, exId, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === setId ? fn(x) : x)) }));

/**
 * Typing changes the number and nothing else. Whether an unticked set counts
 * is its own decision (`toggleSetDone`), and one that can be taken back.
 */
export function editSetWeight(s: EditSession, exId: string, setId: string, text: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({ ...x, weight: text }));
}

export function editSetReps(s: EditSession, exId: string, setId: string, text: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({ ...x, reps: text }));
}

/** W → 1 → D → F, as on the live row. */
export function cycleSetType(s: EditSession, exId: string, setId: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({
    ...x,
    type: TYPE_CYCLE[(TYPE_CYCLE.indexOf(x.type) + 1) % TYPE_CYCLE.length],
  }));
}

/**
 * Logs a set that was left unticked, with the numbers its row holds — or, a
 * second time, takes that back. Only a set stored as not done has this
 * choice: every other set on this screen is done.
 */
export function toggleSetDone(s: EditSession, exId: string, setId: string): EditSession {
  if (!canToggleDone(s, setId)) return s;
  return mapSet(s, exId, setId, (x) => ({ ...x, done: !x.done }));
}

/**
 * A new set under the others starts as a copy of the nearest filled one above
 * it, as real values: what the row shows is what Save writes, and it counts
 * as a change at once. A bodyweight row's weight is left blank, which reads
 * BW. With nothing above to copy, the set is blank and is not saved until it
 * has reps.
 */
export function addSet(s: EditSession, exId: string, newSetId: string): EditSession {
  const stored = originalSets(s);
  return mapExercise(s, exId, (e) => {
    const added: EditSet = blankSet(newSetId);
    const above = e.sets.slice().reverse();
    const reps = above.find((x) => x.reps.trim() !== '');
    if (reps) added.reps = reps.reps;
    const weight = e.kind === 'bodyweight' ? undefined : above.find((x) => x.weight.trim() !== '');
    if (weight) {
      added.weight = weight.weight;
      added.carriedKg = setWeightKg(weight, stored.get(weight.id)?.set, s.unit);
    }
    return { ...e, sets: [...e.sets, added] };
  });
}

export function removeSet(s: EditSession, exId: string, setId: string): EditSession {
  return mapExercise(s, exId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== setId) }));
}

/**
 * Collapses an exercise to its Undo row, in the place its card had (13b). Its
 * sets stay as they were edited, so Undo brings back exactly that card. One
 * that was only added in this session has nothing to undo back to, so it is
 * simply forgotten.
 */
export function removeExercise(s: EditSession, exId: string): EditSession {
  if (!s.original.exercises.some((e) => e.id === exId)) {
    return { ...s, exercises: s.exercises.filter((e) => e.id !== exId) };
  }
  return mapExercise(s, exId, (e) => ({ ...e, removed: true }));
}

export function undoRemoveExercise(s: EditSession, exId: string): EditSession {
  return mapExercise(s, exId, (e) => ({ ...e, removed: false }));
}

export function addExercise(
  s: EditSession,
  chosen: ChosenExercise,
  newExerciseId: string,
  newSetId: string,
): EditSession {
  const added: EditExercise = {
    id: newExerciseId,
    exerciseCatalogId: chosen.id,
    name: chosen.name,
    initials: chosen.initials,
    equipment: chosen.equipment,
    kind: chosen.kind,
    rest: DEFAULT_REST,
    note: '',
    supersetGroup: null,
    sets: [blankSet(newSetId)],
    removed: false,
  };
  // Under everything on screen, a removed row included: that row is holding
  // the place its card comes back to.
  return { ...s, exercises: [...s.exercises, added] };
}

/**
 * Swaps the movement in place. The slot and its rest carry over; the sets and
 * the note do not — they described a different exercise.
 */
export function replaceExercise(
  s: EditSession,
  exId: string,
  chosen: ChosenExercise,
  newSetId: string,
): EditSession {
  return mapExercise(s, exId, (e) => ({
    ...e,
    exerciseCatalogId: chosen.id,
    name: chosen.name,
    initials: chosen.initials,
    equipment: chosen.equipment,
    kind: chosen.kind,
    note: '',
    sets: [blankSet(newSetId)],
  }));
}

/**
 * `order` lists the cards top to bottom. A removed row is not one of them and
 * does not move: the cards are dealt, in their new order, into the places
 * cards already hold.
 */
export function reorderExercises(s: EditSession, order: readonly string[]): EditSession {
  const byId = new Map(s.exercises.map((e) => [e.id, e]));
  const moved = order.flatMap((id) => {
    const e = byId.get(id);
    return e && !e.removed ? [e] : [];
  });
  const cards = [...moved, ...s.exercises.filter((e) => !e.removed && !order.includes(e.id))];
  let next = 0;
  return { ...s, exercises: s.exercises.map((e) => (e.removed ? e : cards[next++])) };
}

/**
 * Groups the given exercises under a group number nothing else is using —
 * or, when they are exactly the members of a group the workout was stored
 * with, under that group's own number, so leaving a superset and joining it
 * again is not a change.
 */
export function joinSuperset(s: EditSession, exIds: readonly string[]): EditSession {
  const used = s.exercises.map((e) => e.supersetGroup ?? 0);
  const group = storedGroupOf(s, exIds) ?? (used.length ? Math.max(...used) : 0) + 1;
  return {
    ...s,
    exercises: s.exercises.map((e) => (exIds.includes(e.id) ? { ...e, supersetGroup: group } : e)),
  };
}

/** The stored group whose members are exactly `exIds`, if nothing else holds its number now. */
function storedGroupOf(s: EditSession, exIds: readonly string[]): number | null {
  const first = s.original.exercises.find((e) => e.id === exIds[0]);
  const g = first?.supersetGroup;
  if (g == null) return null;
  const members = s.original.exercises.filter((e) => e.supersetGroup === g).map((e) => e.id);
  if (members.length !== new Set(exIds).size || !members.every((id) => exIds.includes(id))) return null;
  if (s.exercises.some((e) => e.supersetGroup === g && !exIds.includes(e.id))) return null;
  return g;
}

export function leaveSuperset(s: EditSession, exId: string): EditSession {
  return mapExercise(s, exId, (e) => ({ ...e, supersetGroup: null }));
}

export type When = { startedAt: number; durationSeconds: number };

export function setWhen(s: EditSession, when: When): EditSession {
  return { ...s, startedAt: when.startedAt, durationSeconds: when.durationSeconds };
}

// --- reading the working copy ------------------------------------------------

/**
 * The exercises still in the workout, in order, grouped as Save will store
 * them. A group left holding one exercise is not a superset, so it reads as
 * none — unless the workout was stored that way and nobody touched it, in
 * which case it is left exactly as it was.
 *
 * The screen draws `exerciseRows` instead, which keeps a removed partner's
 * group in view until Save.
 */
export function activeExercises(s: EditSession): EditExercise[] {
  return withoutLoneGroups(s, s.exercises.filter((e) => !e.removed));
}

function withoutLoneGroups(s: EditSession, live: EditExercise[]): EditExercise[] {
  const size = new Map<number, number>();
  for (const e of live) {
    if (e.supersetGroup != null) size.set(e.supersetGroup, (size.get(e.supersetGroup) ?? 0) + 1);
  }
  const storedSize = (group: number) =>
    s.original.exercises.filter((e) => e.supersetGroup === group).length;
  return live.map((e) => {
    const g = e.supersetGroup;
    if (g == null || (size.get(g) ?? 0) >= 2) return e;
    const stored = s.original.exercises.find((o) => o.id === e.id);
    if (stored && stored.supersetGroup === g && storedSize(g) < 2) return e;
    return { ...e, supersetGroup: null };
  });
}

function originalSets(s: EditSession): Map<string, { set: OriginalSet; ex: OriginalExercise; index: number }> {
  const out = new Map<string, { set: OriginalSet; ex: OriginalExercise; index: number }>();
  for (const ex of s.original.exercises) {
    ex.sets.forEach((set, index) => out.set(set.id, { set, ex, index }));
  }
  return out;
}

/**
 * The kilograms a weight field stands for. A field still showing what was
 * stored — however it is typed: "220.46", "220.460", "220,46" — is the stored
 * kilograms, not that text converted again.
 */
function weightKg(
  text: string,
  stored: { weight: number | null } | undefined,
  unit: Unit,
): number | null {
  const typed = parseWeight(text);
  if (stored && typed === toDisplay(stored.weight, unit)) return stored.weight;
  return toKg(typed, unit);
}

/** As `weightKg`, for any row: an added set's copied weight is its stored value. */
function setWeightKg(set: EditSet, stored: OriginalSet | undefined, unit: Unit): number | null {
  if (stored) return weightKg(set.weight, stored, unit);
  return weightKg(
    set.weight,
    set.carriedKg !== undefined ? { weight: set.carriedKg } : undefined,
    unit,
  );
}

/** An added row nobody has typed in. It is not a set, and is ignored. */
const isBlank = (set: EditSet): boolean => set.weight.trim() === '' && set.reps.trim() === '';

function repsOf(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

type FinalSet = {
  id: string;
  type: EditSetType;
  weight: number | null;
  reps: number | null;
  done: boolean;
  isNew: boolean;
};

/**
 * The sets an exercise will hold once saved: exactly what its rows show.
 *
 * An added row with no reps is not a set, so it is left out — silently when
 * it is blank, and as something Save waits for when it is not (`blockers`).
 */
function finalSets(
  s: EditSession,
  ex: EditExercise,
  stored: Map<string, { set: OriginalSet }>,
): FinalSet[] {
  const out: FinalSet[] = [];
  for (const set of ex.sets) {
    const was = stored.get(set.id)?.set;
    const reps = repsOf(set.reps);
    if (!was && reps == null) continue;
    out.push({
      id: set.id,
      type: set.type,
      weight: setWeightKg(set, was, s.unit),
      reps,
      done: set.done,
      isNew: !was,
    });
  }
  return out;
}

/**
 * What keeps Save inert although something changed, by set id and by
 * exercise id.
 *
 * - An added row with a weight but no reps. Dropping it would lose what was
 *   typed; saving it would store a set that never happened.
 * - A stored exercise left with no sets, by removing them or by replacing the
 *   movement and typing nothing. An exercise is never stored empty — though
 *   one that already was, and has not been touched, is not this edit's doing.
 */
function blockers(s: EditSession): { sets: Set<string>; exercises: Set<string> } {
  const stored = originalSets(s);
  const storedEx = new Map(s.original.exercises.map((e) => [e.id, e]));
  const sets = new Set<string>();
  const exercises = new Set<string>();
  for (const e of s.exercises) {
    if (e.removed) continue;
    for (const set of e.sets) {
      if (!stored.has(set.id) && !isBlank(set) && repsOf(set.reps) == null) sets.add(set.id);
    }
    const was = storedEx.get(e.id);
    const emptied = !!was && (was.sets.length > 0 || was.exerciseId !== e.exerciseCatalogId);
    if (emptied && finalSets(s, e, stored).length === 0) {
      exercises.add(e.id);
      // Its first row is where the reps are missing, when it has a row.
      if (e.sets.length > 0) sets.add(e.sets[0].id);
    }
  }
  return { sets, exercises };
}

/** The line an exercise's card shows while it has no rows at all, else null. */
export function exerciseHint(s: EditSession, exId: string): string | null {
  const ex = s.exercises.find((e) => e.id === exId);
  if (!ex || ex.removed || ex.sets.length > 0) return null;
  return blockers(s).exercises.has(exId) ? 'Add a set, or remove this exercise.' : null;
}

// --- the list on screen (13b) ------------------------------------------------

/** One entry of the list, top to bottom: a card, or the row a removed one left. */
export type ExerciseRow = {
  /**
   * The exercise as the screen shows it. Its `supersetGroup` is the rail it
   * sits in, which a removed partner still holds open — `activeExercises` has
   * the grouping that will be saved.
   */
  exercise: EditExercise;
  removed: boolean;
  /** "REMOVED · 4 SETS" on a removed row, else null. */
  removedLabel: string | null;
  /** "A1" / "A2": the group's letter and this exercise's place in it. */
  tag: string | null;
  /** Over the first exercise of a group: "SUPERSET A" and what follows it. */
  header: { label: string; note: string } | null;
  /** The row above / below is a partner, so the rail runs on across the gap. */
  railAbove: boolean;
  railBelow: boolean;
};

/**
 * Everything the list draws, in order. A removed exercise stays where its
 * card was, and a superset it belonged to keeps its rail, its letter and
 * every tag until Save: letters and numbers shifting under the user mid-edit
 * make the list hard to follow. What Save will do to the group is said on its
 * label instead.
 */
export function exerciseRows(s: EditSession): ExerciseRow[] {
  const stored = originalSets(s);
  const storedEx = new Map(s.original.exercises.map((e) => [e.id, e]));
  // Removed rows count as members here, which is all that keeps a group whose
  // partner was removed from reading as none.
  const shown = withoutLoneGroups(s, s.exercises);
  const letters = groupLabels(
    shown.map((e) => ({ id: e.id, supersetGroup: e.supersetGroup, rest: e.rest, sets: [] })),
  );

  const noteFor = (group: EditExercise[]): string => {
    const cards = group.filter((e) => !e.removed);
    if (cards.length === group.length) {
      // Rounds are a count here: every one of them is done.
      const rounds = Math.max(...cards.map((e) => e.sets.filter((x) => x.type === 'normal').length));
      return `· ${rounds} ${rounds === 1 ? 'ROUND' : 'ROUNDS'}`;
    }
    // As `buildPlan` decides it: an addition with nothing logged is not saved.
    const left = cards.filter((e) => storedEx.has(e.id) || finalSets(s, e, stored).length > 0).length;
    return left < 2 ? '· ENDS WHEN SAVED' : `· ${left} AFTER SAVE`;
  };

  return shown.map((e, i) => {
    const g = e.supersetGroup;
    const group = g == null ? [] : shown.filter((x) => x.supersetGroup === g);
    const letter = g == null ? null : (letters.get(g) ?? null);
    // What Save deletes is the exercise as stored, whatever its card showed.
    const setCount = storedEx.get(e.id)?.sets.length ?? e.sets.length;
    return {
      exercise: e,
      removed: e.removed,
      removedLabel: e.removed ? `REMOVED · ${setCount} ${setCount === 1 ? 'SET' : 'SETS'}` : null,
      tag: letter ? `${letter}${group.findIndex((x) => x.id === e.id) + 1}` : null,
      header:
        letter && group.length >= 2 && group[0].id === e.id
          ? { label: `SUPERSET ${letter}`, note: noteFor(group) }
          : null,
      railAbove: g != null && shown[i - 1]?.supersetGroup === g,
      railBelow: g != null && shown[i + 1]?.supersetGroup === g,
    };
  });
}

/** What Remove does to the list's layout, for whoever keeps the scroll steady. */
export type CollapseEffect = {
  /**
   * True when the card folds down to a removed row in its place. False when
   * it leaves the list altogether, gap and all: an exercise only added in
   * this edit has nothing to undo back to.
   */
  leavesRow: boolean;
  /**
   * How many "SUPERSET A" labels the list is shorter by afterwards. Zero when
   * a row is left, since a removed partner holds its group open. A card that
   * vanishes can take its own label with it (unless the next partner inherits
   * it), or end a pair and with it the label over its partner.
   */
  headersLost: number;
};

export function collapseEffect(s: EditSession, exId: string): CollapseEffect {
  const after = exerciseRows(removeExercise(s, exId));
  const headers = (rows: ExerciseRow[]) => rows.filter((r) => r.header).length;
  return {
    leavesRow: after.some((r) => r.exercise.id === exId),
    headersLost: headers(exerciseRows(s)) - headers(after),
  };
}

/** "60 × 6", "BW × 11", "+10 × 8" — no unit, like the PREV cell it replaces. */
function setText(ex: { kind: 'weighted' | 'bodyweight' }, set: OriginalSet, unit: Unit): string {
  const reps = set.reps == null ? '–' : String(set.reps);
  if (ex.kind === 'bodyweight') {
    if (set.weight == null || set.weight === 0) return `BW × ${reps}`;
    return `${set.weight > 0 ? '+' : ''}${weightText(set.weight, unit)} × ${reps}`;
  }
  return `${set.weight == null ? '–' : weightText(set.weight, unit)} × ${reps}`;
}

/**
 * The WAS cell: empty until the set changes, then what was saved, or "new".
 * Every label fits the cell — 76pt at 390pt, about nine characters of 11.5px
 * mono beyond "was ".
 *
 * A set left unticked reads "not done" from the start. That is its state, not
 * a change — but without it the row is indistinguishable from the logged ones
 * around it, and whether it counts is exactly what someone is here to fix.
 * Tapping the cell logs it ("now done"), and tapping again takes that back.
 *
 * An added row Save is waiting on reads "needs reps".
 */
export function wasLabel(s: EditSession, exId: string, setId: string): string {
  const ex = s.exercises.find((e) => e.id === exId);
  const set = ex?.sets.find((x) => x.id === setId);
  if (!ex || !set) return '';
  const found = originalSets(s).get(setId);
  if (!found) return blockers(s).sets.has(setId) ? 'needs reps' : 'new';
  const was = found.set;
  if (!was.done) return set.done ? 'now done' : 'not done';
  const weight = weightKg(set.weight, was, s.unit);
  const reps = repsOf(set.reps);
  if (weight !== was.weight || reps !== was.reps) return `was ${setText(found.ex, was, s.unit)}`;
  if (set.type !== was.type) return `was ${TYPE_WORD[was.type]}`;
  return '';
}

/** True for a set added in this session. */
export function isNewSet(s: EditSession, setId: string): boolean {
  return !originalSets(s).has(setId);
}

/** True for a set stored as not done: its WAS cell switches it on and off. */
export function canToggleDone(s: EditSession, setId: string): boolean {
  const found = originalSets(s).get(setId);
  return !!found && !found.set.done;
}

// --- the plan Save applies ---------------------------------------------------

export type PlanSet = {
  id: string;
  position: number;
  type: EditSetType;
  weight: number | null;
  reps: number | null;
  done: boolean;
};

/** Only the columns that changed are present. */
export type PlanSetPatch = {
  id: string;
  position?: number;
  type?: EditSetType;
  weight?: number | null;
  reps?: number | null;
  done?: boolean;
};

export type PlanExercisePatch = {
  id: string;
  position?: number;
  supersetGroup?: number | null;
  /** The movement was replaced. */
  exerciseId?: string;
  clearNote?: true;
};

export type EditPlan = {
  workoutId: string;
  /** Null unless the user moved the date or the start time. */
  startedAt: number | null;
  /** Null unless the user changed the duration. */
  durationSeconds: number | null;
  /** Derived, never edited. Null unless one of the two above is set. */
  endedAt: number | null;
  removedExerciseIds: string[];
  addedExercises: {
    id: string;
    exerciseId: string;
    position: number;
    restSeconds: number;
    supersetGroup: number | null;
    sets: PlanSet[];
  }[];
  updatedExercises: PlanExercisePatch[];
  removedSetIds: string[];
  updatedSets: PlanSetPatch[];
  addedSets: (PlanSet & { workoutExerciseId: string })[];
  /** Catalog exercise ids whose records need recomputing. */
  touchedExerciseIds: string[];
  /** What the discard sheet counts. */
  changeCount: number;
  /** Sets the workout will hold once saved. */
  setCount: number;
  /**
   * Something on screen cannot be saved as it stands: a half-typed added set,
   * or an exercise with no sets. Save stays inert until it is dealt with.
   */
  blocked: boolean;
};

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function buildPlan(s: EditSession): EditPlan {
  const o = s.original;
  const storedEx = new Map(o.exercises.map((ex, index) => [ex.id, { ex, index }]));
  const stored = originalSets(s);
  const touched = new Set<string>();
  let changeCount = 0;
  let setCount = 0;

  const startChanged = s.startedAt !== o.startedAt;
  const durationChanged = s.durationSeconds !== o.durationSeconds;
  if (startChanged) changeCount += 1;
  if (durationChanged) changeCount += 1;

  const removedExerciseIds: string[] = [];
  for (const e of s.exercises) {
    const was = storedEx.get(e.id);
    if (!e.removed || !was) continue;
    removedExerciseIds.push(e.id);
    touched.add(was.ex.exerciseId);
    changeCount += 1;
  }

  const active = activeExercises(s);
  const finals = new Map(active.map((e) => [e.id, finalSets(s, e, stored)]));
  // An added exercise with nothing logged in it is not saved — and a superset
  // it was the other half of is then not a superset.
  const saved = withoutLoneGroups(
    s,
    active.filter((e) => storedEx.has(e.id) || (finals.get(e.id) ?? []).length > 0),
  );

  const blocking = blockers(s);
  // A half-typed row is not in the plan, but it is something to discard.
  for (const e of active) {
    for (const set of e.sets) {
      if (!stored.has(set.id) && blocking.sets.has(set.id) && !isBlank(set)) changeCount += 1;
    }
  }

  const survivors = saved.filter((e) => storedEx.has(e.id)).map((e) => e.id);
  const reordered = !sameOrder(
    survivors,
    o.exercises.filter((e) => survivors.includes(e.id)).map((e) => e.id),
  );
  if (reordered) changeCount += 1;
  const renumber =
    reordered || removedExerciseIds.length > 0 || saved.some((e) => !storedEx.has(e.id));

  const addedExercises: EditPlan['addedExercises'] = [];
  const updatedExercises: PlanExercisePatch[] = [];
  const removedSetIds: string[] = [];
  const updatedSets: PlanSetPatch[] = [];
  const addedSets: EditPlan['addedSets'] = [];

  saved.forEach((e, position) => {
    const sets = finals.get(e.id) ?? [];
    setCount += sets.length;
    const was = storedEx.get(e.id);

    if (!was) {
      addedExercises.push({
        id: e.id,
        exerciseId: e.exerciseCatalogId,
        position,
        restSeconds: e.rest,
        supersetGroup: e.supersetGroup,
        sets: sets.map((f, i) => ({
          id: f.id,
          position: i,
          type: f.type,
          weight: f.weight,
          reps: f.reps,
          done: f.done,
        })),
      });
      touched.add(e.exerciseCatalogId);
      changeCount += 1;
      return;
    }

    const patch: PlanExercisePatch = { id: e.id };
    if (renumber && position !== (was.ex.position ?? was.index)) patch.position = position;
    if (e.supersetGroup !== was.ex.supersetGroup) {
      patch.supersetGroup = e.supersetGroup;
      changeCount += 1;
    }
    const replaced = e.exerciseCatalogId !== was.ex.exerciseId;
    if (replaced) {
      patch.exerciseId = e.exerciseCatalogId;
      patch.clearNote = true;
      touched.add(was.ex.exerciseId);
      touched.add(e.exerciseCatalogId);
      changeCount += 1;
    }
    if (Object.keys(patch).length > 1) updatedExercises.push(patch);

    const gone = was.ex.sets.filter((x) => !e.sets.some((y) => y.id === x.id));
    for (const x of gone) removedSetIds.push(x.id);
    if (gone.length > 0) touched.add(was.ex.exerciseId);
    // A replacement is one change, however many sets went with it.
    if (!replaced) changeCount += gone.length;

    const reshaped = gone.length > 0 || sets.some((f) => f.isNew);
    sets.forEach((f, i) => {
      if (f.isNew) {
        addedSets.push({
          id: f.id,
          workoutExerciseId: e.id,
          position: i,
          type: f.type,
          weight: f.weight,
          reps: f.reps,
          done: f.done,
        });
        touched.add(e.exerciseCatalogId);
        if (!replaced) changeCount += 1;
        return;
      }
      const before = stored.get(f.id);
      if (!before) return;
      const setPatch: PlanSetPatch = { id: f.id };
      if (f.type !== before.set.type) setPatch.type = f.type;
      if (f.weight !== before.set.weight) setPatch.weight = f.weight;
      if (f.reps !== before.set.reps) setPatch.reps = f.reps;
      if (f.done !== before.set.done) setPatch.done = f.done;
      if (Object.keys(setPatch).length > 1) {
        touched.add(e.exerciseCatalogId);
        changeCount += 1;
      }
      // Renumbered only once the list has changed shape, and then all of it,
      // so an added set cannot land on a position another already holds.
      if (reshaped && i !== (before.set.position ?? before.index)) setPatch.position = i;
      if (Object.keys(setPatch).length > 1) updatedSets.push(setPatch);
    });
  });

  // A record carries the date it was set on, and ties go to the earlier
  // session, so moving the workout can move any of its exercises' records.
  if (startChanged) {
    for (const ex of o.exercises) touched.add(ex.exerciseId);
    for (const e of saved) touched.add(e.exerciseCatalogId);
  }

  const whenChanged = startChanged || durationChanged;
  return {
    workoutId: o.id,
    startedAt: startChanged ? s.startedAt : null,
    durationSeconds: durationChanged ? s.durationSeconds : null,
    endedAt: whenChanged ? endsAt(s.startedAt, s.durationSeconds) : null,
    removedExerciseIds,
    addedExercises,
    updatedExercises,
    removedSetIds,
    updatedSets,
    addedSets,
    touchedExerciseIds: [...touched],
    changeCount,
    setCount,
    blocked: blocking.sets.size > 0 || blocking.exercises.size > 0,
  };
}

/** Save lights up once this is true. */
export function hasChanges(s: EditSession): boolean {
  return buildPlan(s).changeCount > 0;
}

/** Something changed, what is left is still a workout, and nothing is half-entered. */
export function canSave(s: EditSession): boolean {
  return planCanSave(buildPlan(s));
}

export function planCanSave(plan: EditPlan): boolean {
  return plan.changeCount > 0 && plan.setCount > 0 && !plan.blocked;
}

// --- date, start and duration ------------------------------------------------

export const MIN_DURATION_SECONDS = 60;
/** The wheel's last stop: 23 h 59 min. */
export const MAX_DURATION_SECONDS = 23 * 3600 + 59 * 60;

/** The end is derived from the other two, so the fields cannot contradict each other. */
export function endsAt(startedAt: number, durationSeconds: number): number {
  return startedAt + durationSeconds * 1000;
}

/**
 * Pulls a picked date and duration back into what is possible: the workout
 * cannot start in the future, cannot end in it either, and lasts between a
 * minute and the wheel's last stop.
 *
 * `storedDuration` is the duration as saved. A workout that ran 30 hours
 * because Finish was never tapped is already past the wheel's range, and
 * moving only its date must not quietly shorten it.
 */
export function clampWhen(when: When, now: number, storedDuration?: number): When {
  const startedAt = Math.min(when.startedAt, now);
  const room = Math.floor((now - startedAt) / 60_000) * 60;
  // A duration nobody changed is not corrected, whatever it is: a workout
  // stored with none keeps none. Only an end in the future can shorten it.
  if (when.durationSeconds === storedDuration && storedDuration <= room) {
    return { startedAt, durationSeconds: storedDuration };
  }
  const cap = when.durationSeconds === storedDuration ? Infinity : MAX_DURATION_SECONDS;
  const max = Math.max(MIN_DURATION_SECONDS, Math.min(cap, room));
  const durationSeconds = Math.min(max, Math.max(MIN_DURATION_SECONDS, when.durationSeconds));
  return { startedAt, durationSeconds };
}

/**
 * The rule while a wheel is still turning: only the start is held back.
 *
 * `clampWhen` also shortens a duration that would run past now, and doing that
 * on every step would be destructive — scrolling the day to today passes
 * through "today at 18:00", which at noon is the future, and the duration
 * would be cut to a minute before the hour wheel was ever touched. So the
 * duration is only kept inside the wheel's own range here, and the end is
 * checked once, when the picker is confirmed.
 */
export function clampWhileTurning(when: When, now: number, storedDuration?: number): When {
  const startedAt = Math.min(when.startedAt, now);
  // Untouched, so left exactly as stored: turning the date wheel must not
  // give a workout stored with no duration a minute it never had.
  if (when.durationSeconds === storedDuration) return { startedAt, durationSeconds: storedDuration };
  return {
    startedAt,
    durationSeconds: Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, when.durationSeconds)),
  };
}

export type StartParts = { year: number; month: number; day: number; hour: number; minute: number };

/** A start as the wheels show it, in local time. `month` is 0-based. */
export function startParts(ms: number): StartParts {
  const d = new Date(ms);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Wheels back to a start. A day the month does not have becomes its last one.
 * Wheels sitting on the stored start give back that exact instant, seconds and
 * all, so scrolling away and back is not a change.
 */
export function startFromParts(p: StartParts, stored?: number): number {
  if (stored != null) {
    const was = startParts(stored);
    if (
      was.year === p.year &&
      was.month === p.month &&
      was.day === p.day &&
      was.hour === p.hour &&
      was.minute === p.minute
    ) {
      return stored;
    }
  }
  const day = Math.min(p.day, daysInMonth(p.year, p.month));
  return new Date(p.year, p.month, day, p.hour, p.minute).getTime();
}

export function durationParts(seconds: number): { hours: number; minutes: number } {
  const s = Math.max(0, Math.floor(seconds));
  return { hours: Math.floor(s / 3600), minutes: Math.floor((s % 3600) / 60) };
}

/** As `startFromParts`: wheels showing the stored duration keep its seconds. */
export function durationFromParts(hours: number, minutes: number, stored?: number): number {
  if (stored != null) {
    const was = durationParts(stored);
    if (was.hours === hours && was.minutes === minutes) return stored;
  }
  return hours * 3600 + minutes * 60;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

export const MONTH_NAMES: readonly string[] = MONTH;

/** "Tue 7 Jul" — the DATE cell. */
export function fmtCellDate(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAY[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

/** "Tue, 7 Jul 2026" — the picker's Date row. */
export function fmtLongDate(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]} ${d.getFullYear()}`;
}

/** "23 Jun" — where a record falls back to. */
export function fmtDayMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

/** "09:06", local time. */
export function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "9:41" — hours and minutes, as the Summary shows a duration. */
export function fmtHoursMinutes(seconds: number): string {
  const { hours, minutes } = durationParts(seconds);
  return `${hours}:${pad2(minutes)}`;
}

// --- records -----------------------------------------------------------------

export type RecordContext = {
  /**
   * Every OTHER completed session of an exercise, by catalog id. An exercise
   * with no entry has not been loaded yet and reports nothing — an empty list
   * means it has genuinely never been trained anywhere else.
   */
  history: Record<string, PRSession[]>;
  /** The mass this workout's bodyweight movements were performed at. */
  bodyweightKg: number;
  countWarmups: boolean;
};

export type RecordChange = {
  /** Catalog exercise id. */
  exerciseId: string;
  exerciseName: string;
  metric: RecordMetric;
  kind: 'lost' | 'gained';
  /** The record as it stands now. Null for a first-ever record. */
  from: RecordValue | null;
  /** The record after Save. Null when nothing is left behind it. */
  to: RecordValue | null;
};

/**
 * True while an exercise on screen has no history loaded yet. `recordImpact`
 * reports nothing for it, so Save must wait rather than read that as "no
 * record moves" and skip the confirmation.
 */
export function recordsPending(s: EditSession, ctx: RecordContext): boolean {
  return activeExercises(s).some((e) => !ctx.history[e.exerciseCatalogId]);
}

const METRIC_ORDER: RecordMetric[] = ['best_set', 'est_1rm', 'max_reps', 'best_volume'];

/** best_set's value is its weight; reps break the tie, as in `computeRecords`. */
function compareRecord(metric: RecordMetric, a: RecordValue, b: RecordValue): number {
  if (a.value !== b.value) return a.value - b.value;
  if (metric === 'best_set') return (a.reps ?? 0) - (b.reps ?? 0);
  return 0;
}

const newestFirst = (sessions: PRSession[]): PRSession[] =>
  sessions.slice().sort((a, b) => b.achievedAt - a.achievedAt);

/**
 * Which records this edit moves, before anything is written.
 *
 * `recomputeForExercise` rebuilds an exercise's records from its whole history
 * on Save, so the outcome is already decided by the numbers on screen: the
 * same computation is run here twice, once with the workout as stored and once
 * as edited, and the two are compared. A lost record names what it falls back
 * to because that fallback is simply what the second run found.
 */
export function recordImpact(s: EditSession, ctx: RecordContext): RecordChange[] {
  const stored = originalSets(s);
  const names = new Map<string, string>();
  for (const ex of s.original.exercises) if (!names.has(ex.exerciseId)) names.set(ex.exerciseId, ex.name);
  const active = activeExercises(s);
  for (const e of active) if (!names.has(e.exerciseCatalogId)) names.set(e.exerciseCatalogId, e.name);

  const out: RecordChange[] = [];
  for (const [exerciseId, exerciseName] of names) {
    const others = ctx.history[exerciseId];
    if (!others) continue;

    const before: PRSet[] = s.original.exercises
      .filter((ex) => ex.exerciseId === exerciseId)
      .flatMap((ex) =>
        ex.sets.map((x) => ({
          id: x.id,
          type: x.type,
          weight: x.weight,
          reps: x.reps,
          done: x.done,
          kind: ex.kind,
        })),
      );
    const after: PRSet[] = active
      .filter((e) => e.exerciseCatalogId === exerciseId)
      .flatMap((e) =>
        finalSets(s, e, stored).map((f) => ({
          id: f.id,
          type: f.type,
          weight: f.weight,
          reps: f.reps,
          done: f.done,
          kind: e.kind,
        })),
      );

    const withThis = (sets: PRSet[], achievedAt: number): PRSession[] =>
      newestFirst(
        sets.length > 0
          ? [...others, { id: s.original.id, achievedAt, sets, bodyweightKg: ctx.bodyweightKg }]
          : others,
      );
    const was = computeRecords(withThis(before, s.original.startedAt), ctx.countWarmups);
    const will = computeRecords(withThis(after, s.startedAt), ctx.countWarmups);

    for (const metric of METRIC_ORDER) {
      const from = was[metric] ?? null;
      const to = will[metric] ?? null;
      if (from && (!to || compareRecord(metric, to, from) < 0)) {
        out.push({ exerciseId, exerciseName, metric, kind: 'lost', from, to });
      } else if (to && (!from || compareRecord(metric, to, from) > 0)) {
        out.push({ exerciseId, exerciseName, metric, kind: 'gained', from, to });
      }
    }
  }
  return out;
}

const METRIC_LABEL: Record<RecordMetric, string> = {
  best_set: 'HEAVIEST WEIGHT',
  est_1rm: 'EST. 1RM',
  max_reps: 'MOST REPS',
  best_volume: 'BEST VOLUME',
};

const EM_DASH = '—';

export type RecordRow = { metric: string; from: string; to: string; note: string; gained: boolean };

/** One row of the save sheet: `68 × 5 → 66 × 5`, and where the new value is from. */
export function recordRow(change: RecordChange, unit: Unit): RecordRow {
  const text = (v: RecordValue | null): string => {
    if (!v) return EM_DASH;
    // Most reps is a count; the weight it was done at is not the record.
    if (change.metric === 'max_reps') return String(v.value);
    return recordDisplay(change.metric, v.value, v.display, unit);
  };
  const gained = change.kind === 'gained';
  let note = 'New record';
  if (!gained) {
    note =
      change.to == null
        ? 'No earlier record'
        : change.to.achievedAt != null
          ? `From ${fmtDayMonth(change.to.achievedAt)}`
          : 'From your history';
  }
  return { metric: METRIC_LABEL[change.metric], from: text(change.from), to: text(change.to), note, gained };
}

const LINE_PREFIX: Record<RecordMetric, string> = {
  best_set: '',
  max_reps: '',
  est_1rm: 'Est. 1RM ',
  best_volume: 'Volume ',
};

/**
 * The one neutral line a card shows while its exercise has a record moving:
 * "68 × 5 was a record. Falls back to 66 × 5 · 23 Jun". A loss is named ahead
 * of a gain, and the heaviest-set record ahead of the rest.
 */
export function recordLine(changes: readonly RecordChange[], unit: Unit): string | null {
  const change = changes.find((c) => c.kind === 'lost') ?? changes[0];
  if (!change) return null;
  const full = (v: RecordValue) =>
    `${LINE_PREFIX[change.metric]}${recordDisplay(change.metric, v.value, v.display, unit)}`;
  if (change.kind === 'gained') return change.to ? `${full(change.to)} is a new record.` : null;
  if (!change.from) return null;
  const head = `${full(change.from)} was a record.`;
  if (!change.to) return `${head} No earlier record.`;
  const when = change.to.achievedAt != null ? ` · ${fmtDayMonth(change.to.achievedAt)}` : '';
  return `${head} Falls back to ${full(change.to)}${when}`;
}
