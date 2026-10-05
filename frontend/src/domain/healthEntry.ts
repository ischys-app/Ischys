/**
 * A workout's entry in Apple Health, and what editing the workout does to it
 * (#90, board 13b, frames E12–E14).
 *
 * Two different things can have put a finished workout in Health. Ischys on
 * the phone writes a plain entry: a start, an end, and energy if a Watch
 * measured any. The Watch app records one: a session with heart rate behind
 * it. The first is a statement Ischys made and should keep true, so it
 * follows an edit to the workout's time. The second is a measurement, and
 * moving it would make it false, so it is never touched.
 *
 * Every decision about that lives here — which of the cases a workout is in,
 * the one line the Date & time sheet says about it, whether Save replaces the
 * entry, and what is recorded afterwards. lib/healthSync.ts does the reading
 * and writing these decide on.
 *
 * Pure, so `node --test` covers it.
 */

/** Who wrote the HKWorkout: Ischys on the phone, or the Watch app's session. */
export type HealthWriter = 'phone' | 'watch';

/**
 * `uuid` is null while the writer is known but the entry has not been seen in
 * this phone's Health store yet — a Watch recording still on its way over.
 */
export type HealthEntry = { uuid: string | null; writer: HealthWriter };

/** An entry as a lookup in Health returns it: there, so it has a UUID. */
export type FoundHealthEntry = { uuid: string; writer: HealthWriter };

/** A looked-up entry with where Health has it starting (epoch ms). */
export type LocatedHealthEntry = FoundHealthEntry & { startedAt: number };

/** The two nullable columns on `workouts`, read back. */
export function healthEntryFromRow(uuid: string | null, writer: string | null): HealthEntry | null {
  if (writer !== 'phone' && writer !== 'watch') return null;
  return { uuid: uuid ?? null, writer };
}

// --- the Date & time sheet ---------------------------------------------------

export type HealthEditState = {
  /** Health exists on this device and the user connected it. */
  connected: boolean;
  entry: HealthEntry | null;
  /**
   * Ischys may write workouts: its own "write workouts" setting is on, and
   * iOS reports write access as granted. (Write access is the one permission
   * HealthKit reports honestly.)
   */
  canWrite: boolean;
};

export type HealthEditCase =
  /** Not connected, or no entry: the sheet is exactly E4. */
  | 'none'
  /** Ischys wrote it and can write: Save replaces it (E12). */
  | 'updates'
  /** The Watch recorded it: it is kept as it is (E13). */
  | 'watch'
  /** Ischys wrote it, but writing is off now: it stays as it is (E14). */
  | 'writeOff';

export function healthEditCase(state: HealthEditState): HealthEditCase {
  if (!state.connected || !state.entry) return 'none';
  if (state.entry.writer === 'watch') return 'watch';
  return state.canWrite ? 'updates' : 'writeOff';
}

const LINE: Record<Exclude<HealthEditCase, 'none'>, string> = {
  updates: 'Saving updates this workout in Apple Health too.',
  watch: 'Apple Health keeps your Watch’s recording. Only Ischys changes.',
  writeOff: 'Writing to Apple Health is off, so it won’t change.',
};

/**
 * The sheet's Health line, or null for no line at all. A fact about Save, not
 * a warning, so it reads the same before and after anything is changed.
 */
export function healthEditLine(state: HealthEditState): string | null {
  const which = healthEditCase(state);
  return which === 'none' ? null : LINE[which];
}

// --- Save --------------------------------------------------------------------

/** The edit plan's time fields: all null unless the date, start or duration changed. */
export type PlannedWhen = {
  startedAt: number | null;
  durationSeconds: number | null;
  endedAt: number | null;
};

export type HealthReplacement = { uuid: string; startedAt: number; endedAt: number };

/**
 * The entry to replace and the window to give it, or null to leave Health
 * alone. Only a change to the date, the start or the duration gets here: a
 * plan sets `endedAt` for exactly those, and never for set edits.
 */
export function healthReplacement(
  state: HealthEditState,
  plan: PlannedWhen,
  stored: { startedAt: number },
): HealthReplacement | null {
  if (plan.endedAt == null) return null;
  if (healthEditCase(state) !== 'updates') return null;
  const uuid = state.entry?.uuid;
  if (!uuid) return null;
  const startedAt = plan.startedAt ?? stored.startedAt;
  if (!(plan.endedAt > startedAt)) return null;
  return { uuid, startedAt, endedAt: plan.endedAt };
}

export type ReplaceOutcome =
  | { status: 'replaced'; uuid: string }
  /** Health answered, and has no such entry any more: it was deleted there. */
  | { status: 'missing' }
  /** The entry is not one the phone wrote. Nothing was done to it. */
  | { status: 'notOurs' }
  /** iOS does not let Ischys write workouts. */
  | { status: 'denied' }
  /**
   * Nothing changed. Includes Health not answering at all, as it does on a
   * locked phone: that is not "missing", and the entry stays on record.
   */
  | { status: 'failed' }
  /** No Health here, or a native module that cannot replace. */
  | { status: 'unavailable' };

/** What to store about the entry once a replace has been tried. */
export function entryAfterReplace(entry: HealthEntry, outcome: ReplaceOutcome): HealthEntry | null {
  switch (outcome.status) {
    case 'replaced':
      return { uuid: outcome.uuid, writer: 'phone' };
    case 'missing':
      return null;
    case 'notOurs':
      return { ...entry, writer: 'watch' };
    default:
      return entry;
  }
}

// --- finding a workout's entry -----------------------------------------------

/**
 * The stretch of time a workout's entry is looked for over, or null when the
 * workout has no length to look over.
 */
export function healthWindow(w: {
  startedAt: number;
  durationSeconds: number;
  endedAt: number | null;
}): { startedAt: number; endedAt: number } | null {
  const endedAt = w.endedAt ?? w.startedAt + w.durationSeconds * 1000;
  return endedAt > w.startedAt ? { startedAt: w.startedAt, endedAt } : null;
}

/**
 * True when Health should be asked: nothing is recorded (a workout finished
 * before entries were recorded at all), or the writer is known and the UUID
 * is not.
 */
export function needsLookup(entry: HealthEntry | null): boolean {
  return !entry || entry.uuid == null;
}

/**
 * How far a phone-written entry's start may sit from the workout's stored
 * start and still be that workout's. The phone writes the exact window, so
 * this only has to absorb rounding.
 */
export const PHONE_START_TOLERANCE_MS = 60_000;

/**
 * Whether an entry found by looking over a workout's window may be recorded
 * as that workout's. The window match alone is loose — most of both spans
 * overlapping — and what is recorded here is what a later edit moves, so a
 * neighbour's entry must not get through:
 *
 * - an entry another workout already holds is that workout's;
 * - an entry the phone wrote starts when its workout starts. One that does
 *   not was written for another workout, or for this one before its time was
 *   edited on a build that left Health alone.
 *
 * A Watch recording starts a moment after the workout does, so it is held to
 * the first rule only; recording one wrongly could not move it anyway.
 */
export function lookupAccepted(i: {
  /** The workout's start as stored, before any edit. */
  workoutStartedAt: number;
  found: LocatedHealthEntry;
  /** Another `workouts` row already records this UUID. */
  heldByAnother: boolean;
}): boolean {
  if (i.heldByAnother) return false;
  if (i.found.writer !== 'phone') return true;
  return Math.abs(i.found.startedAt - i.workoutStartedAt) <= PHONE_START_TOLERANCE_MS;
}

/** Health is the authority when it answers; silence changes nothing. */
export function entryAfterLookup(
  stored: HealthEntry | null,
  found: FoundHealthEntry | null,
): HealthEntry | null {
  return found ? { uuid: found.uuid, writer: found.writer } : stored;
}

// --- finish ------------------------------------------------------------------

/**
 * What to record when a workout finishes, from what the finish path learned.
 *
 * - The Watch confirmed its save: it is the writer. Its message carries the
 *   UUID; an older Watch build's does not, and then Health is asked — which
 *   may not have the recording yet, so the UUID can stay unknown for now.
 * - No confirmation, but Ischys's entry is already in Health: that one,
 *   written by whoever Health says wrote it.
 * - Otherwise the phone wrote it, if it wrote anything.
 */
export function entryAtFinish(i: {
  watchConfirmed: boolean;
  watchUuid: string | null;
  found: FoundHealthEntry | null;
  phoneSaved: { saved: boolean; uuid: string | null } | null;
}): HealthEntry | null {
  if (i.watchConfirmed) {
    const seen = i.found?.writer === 'watch' ? i.found.uuid : null;
    return { uuid: i.watchUuid ?? seen, writer: 'watch' };
  }
  if (i.found) return { uuid: i.found.uuid, writer: i.found.writer };
  if (i.phoneSaved?.saved) return { uuid: i.phoneSaved.uuid, writer: 'phone' };
  return null;
}
