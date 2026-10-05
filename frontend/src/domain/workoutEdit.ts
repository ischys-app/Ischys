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
  /** Collapsed to a dashed row with Undo. Gone on Save. */
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
        weight: weightText(s.weight, unit),
        reps: s.reps == null ? '' : String(s.reps),
        done: s.done,
      })),
    })),
  };
}

// --- edits -------------------------------------------------------------------

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

/** Typing into a set says it happened, so an unticked one is logged with it. */
export function editSetWeight(s: EditSession, exId: string, setId: string, text: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({ ...x, weight: text, done: true }));
}

export function editSetReps(s: EditSession, exId: string, setId: string, text: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({ ...x, reps: text, done: true }));
}

/** W → 1 → D → F, as on the live row. */
export function cycleSetType(s: EditSession, exId: string, setId: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({
    ...x,
    type: TYPE_CYCLE[(TYPE_CYCLE.indexOf(x.type) + 1) % TYPE_CYCLE.length],
  }));
}

/** Logs a set that was left unticked, with the numbers it already holds. */
export function markSetDone(s: EditSession, exId: string, setId: string): EditSession {
  return mapSet(s, exId, setId, (x) => ({ ...x, done: true }));
}

export function addSet(s: EditSession, exId: string, newSetId: string): EditSession {
  return mapExercise(s, exId, (e) => ({
    ...e,
    sets: [...e.sets, { id: newSetId, type: 'normal', weight: '', reps: '', done: true }],
  }));
}

export function removeSet(s: EditSession, exId: string, setId: string): EditSession {
  return mapExercise(s, exId, (e) => ({ ...e, sets: e.sets.filter((x) => x.id !== setId) }));
}

/**
 * Collapses an exercise to its Undo row. One that was only added in this
 * session has nothing to undo back to, so it is simply forgotten.
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

const blankSet = (id: string): EditSet => ({ id, type: 'normal', weight: '', reps: '', done: true });

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
  // After the last card, ahead of the removed rows, which is where it shows.
  const live = s.exercises.filter((e) => !e.removed);
  const gone = s.exercises.filter((e) => e.removed);
  return { ...s, exercises: [...live, added, ...gone] };
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

/** `order` lists the cards top to bottom. Removed rows keep their place after them. */
export function reorderExercises(s: EditSession, order: readonly string[]): EditSession {
  const byId = new Map(s.exercises.map((e) => [e.id, e]));
  const moved = order.flatMap((id) => {
    const e = byId.get(id);
    return e && !e.removed ? [e] : [];
  });
  const rest = s.exercises.filter((e) => e.removed || !order.includes(e.id));
  return { ...s, exercises: [...moved, ...rest] };
}

/** Groups the given exercises under a group number nothing else is using. */
export function joinSuperset(s: EditSession, exIds: readonly string[]): EditSession {
  const used = s.exercises.map((e) => e.supersetGroup ?? 0);
  const group = (used.length ? Math.max(...used) : 0) + 1;
  return {
    ...s,
    exercises: s.exercises.map((e) => (exIds.includes(e.id) ? { ...e, supersetGroup: group } : e)),
  };
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
 * The cards on screen, in order. A group left holding one exercise is not a
 * superset, so it reads as none — unless the workout was stored that way and
 * nobody touched it, in which case it is left exactly as it was.
 */
export function activeExercises(s: EditSession): EditExercise[] {
  const live = s.exercises.filter((e) => !e.removed);
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

/** The exercises collapsed to an Undo row. */
export function removedExercises(s: EditSession): EditExercise[] {
  return s.exercises.filter((e) => e.removed);
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
function weightKg(text: string, stored: OriginalSet | undefined, unit: Unit): number | null {
  const typed = parseWeight(text);
  if (stored && typed === toDisplay(stored.weight, unit)) return stored.weight;
  return toKg(typed, unit);
}

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
 * The sets an exercise will hold once saved.
 *
 * A stored set is whatever its row says. An added one logs what it shows,
 * which for a blank field is the value carried down from the nearest filled
 * set above — the same placeholder rule as a live workout — and an added set
 * with no reps at all is not a set, so it is left out.
 */
function finalSets(
  s: EditSession,
  ex: EditExercise,
  stored: Map<string, { set: OriginalSet }>,
): FinalSet[] {
  const out: FinalSet[] = [];
  ex.sets.forEach((set, i) => {
    const was = stored.get(set.id)?.set;
    if (was) {
      out.push({
        id: set.id,
        type: set.type,
        weight: weightKg(set.weight, was, s.unit),
        reps: repsOf(set.reps),
        done: set.done,
        isNew: false,
      });
      return;
    }
    let weight: number | null | undefined =
      set.weight.trim() !== '' ? toKg(parseWeight(set.weight), s.unit) : undefined;
    let reps: number | null | undefined = set.reps.trim() !== '' ? repsOf(set.reps) : undefined;
    for (let j = i - 1; j >= 0 && (weight === undefined || reps === undefined); j--) {
      const above = ex.sets[j];
      // A bodyweight row's blank weight reads BW, so that is what it logs.
      if (weight === undefined && ex.kind !== 'bodyweight' && above.weight.trim() !== '') {
        weight = weightKg(above.weight, stored.get(above.id)?.set, s.unit);
      }
      if (reps === undefined && above.reps.trim() !== '') reps = repsOf(above.reps);
    }
    if (reps == null) return;
    out.push({ id: set.id, type: set.type, weight: weight ?? null, reps, done: true, isNew: true });
  });
  return out;
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
 *
 * A set left unticked reads "not done" from the start. That is its state, not
 * a change — but without it the row is indistinguishable from the logged ones
 * around it, and whether it counts is exactly what someone is here to fix.
 */
export function wasLabel(s: EditSession, exId: string, setId: string): string {
  const ex = s.exercises.find((e) => e.id === exId);
  const set = ex?.sets.find((x) => x.id === setId);
  if (!ex || !set) return '';
  const found = originalSets(s).get(setId);
  if (!found) return 'new';
  const was = found.set;
  const weight = weightKg(set.weight, was, s.unit);
  const reps = repsOf(set.reps);
  if (weight !== was.weight || reps !== was.reps) return `was ${setText(found.ex, was, s.unit)}`;
  if (set.done !== was.done) return 'was not done';
  if (set.type !== was.type) return `was ${TYPE_WORD[was.type]}`;
  return was.done ? '' : 'not done';
}

/** True for a set added in this session — its blank fields show carried values. */
export function isNewSet(s: EditSession, setId: string): boolean {
  return !originalSets(s).has(setId);
}

/** True for a stored set that was never ticked and has not been touched. */
export function isUntickedSet(s: EditSession, exId: string, setId: string): boolean {
  return wasLabel(s, exId, setId) === 'not done';
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
  // An added exercise with nothing logged in it is not saved.
  const saved = active.filter((e) => storedEx.has(e.id) || (finals.get(e.id) ?? []).length > 0);

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
  };
}

/** Save lights up once this is true. */
export function hasChanges(s: EditSession): boolean {
  return buildPlan(s).changeCount > 0;
}

/** Something changed, and what is left is still a workout. */
export function canSave(s: EditSession): boolean {
  const plan = buildPlan(s);
  return plan.changeCount > 0 && plan.setCount > 0;
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
  const cap = when.durationSeconds === storedDuration ? Infinity : MAX_DURATION_SECONDS;
  return {
    startedAt: Math.min(when.startedAt, now),
    durationSeconds: Math.min(cap, Math.max(MIN_DURATION_SECONDS, when.durationSeconds)),
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
