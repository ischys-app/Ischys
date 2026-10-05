/**
 * Effort per set (RPE / RIR).
 *
 * One number is stored: RPE, on `workout_sets.rpe`. RIR is only a way of
 * reading it — reps in reserve = 10 − RPE — so switching the setting converts
 * every existing rating instead of leaving two kinds of number in one column.
 * The RIR scale's "5+" is stored as RPE 5, and anything easier still reads as
 * "5+".
 *
 * Everything the screens say about a rating comes from here, so the row, the
 * rest bar, the sheet, the summary and the history cannot disagree. Pure — no
 * imports, so `node --test` can run it. The setting itself is read through
 * lib/effortMode.ts.
 */

/** The setting: hidden, or shown on one of the two scales. */
export type EffortMode = 'off' | 'rpe' | 'rir';
/** A scale a rating can be shown on. */
export type EffortScaleKind = 'rpe' | 'rir';

export function isEffortMode(v: unknown): v is EffortMode {
  return v === 'off' || v === 'rpe' || v === 'rir';
}

/**
 * A value on its way into storage, or null when it is not a rating.
 *
 * Ratings live on a half-step grid. The range is wider than the scale this app
 * offers (6 to 10) because an imported history may hold lower ones, and
 * dropping them would lose what the user recorded.
 */
export function normalizeRpe(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  if (v <= 0 || v > 10) return null;
  return Math.round(v * 2) / 2;
}

// --- The scale ---------------------------------------------------------

export type EffortStep = {
  /** What tapping this cell stores. */
  rpe: number;
  /** What the cell says. */
  label: string;
  /** A half step: drawn smaller, so the whole numbers are easy to find. */
  half: boolean;
};

const RPE_STEPS: readonly EffortStep[] = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((rpe) => ({
  rpe,
  label: String(rpe),
  half: !Number.isInteger(rpe),
}));

const RIR_STEPS: readonly EffortStep[] = [
  { rpe: 5, label: '5+', half: false },
  { rpe: 6, label: '4', half: false },
  { rpe: 7, label: '3', half: false },
  { rpe: 8, label: '2', half: false },
  { rpe: 9, label: '1', half: false },
  { rpe: 10, label: '0', half: false },
];

/**
 * The cells of the scale, left to right. Harder is on the right in both, so
 * switching scale never flips where the thumb goes.
 */
export function effortSteps(kind: EffortScaleKind): readonly EffortStep[] {
  return kind === 'rir' ? RIR_STEPS : RPE_STEPS;
}

/** Which cell an x offset falls in, clamped to the bar. */
export function stepAt(x: number, width: number, count: number): number {
  if (!(width > 0) || count <= 0) return 0;
  const i = Math.floor(x / (width / count));
  return Math.max(0, Math.min(count - 1, i));
}

/** How a touch on the scale came to an end. */
export type EffortTouchEnd =
  /** The drag was recognised and the finger came off the glass. */
  | 'ended'
  /** Never recognised as a drag: a tap, or a touch lost before it moved. */
  | 'failed'
  /** Taken away mid-drag: a call, a system gesture, another gesture winning. */
  | 'cancelled';

/**
 * The cell a finished touch chose, or null when it chose nothing.
 *
 * Only a finger lifting off the glass is a choice. A touch the system takes
 * away has to leave the rating alone, and so does lifting well above or below
 * the bar, which is how a drag is called off.
 */
export function releasedStep(input: {
  /** The cell under the thumb, or null when the touch never landed on one. */
  active: number | null;
  end: EffortTouchEnd;
  /** A finger was seen lifting, with none left down. Tells a tap from a lost touch. */
  fingerUp: boolean;
  /** Where it lifted, relative to the bar's top. */
  y: number;
  height: number;
  /** How far above or below the bar still counts. */
  slop: number;
}): number | null {
  const { active, end, fingerUp, y, height, slop } = input;
  if (active == null) return null;
  if (end === 'cancelled') return null;
  if (end === 'failed' && !fingerUp) return null;
  if (y < -slop || y > height + slop) return null;
  return active;
}

/** The cell showing a stored rating, or -1 when this scale has no cell for it. */
export function selectedStep(rpe: number | null | undefined, kind: EffortScaleKind): number {
  if (rpe == null) return -1;
  if (kind === 'rir' && rpe <= 5) return 0;
  return effortSteps(kind).findIndex((s) => s.rpe === rpe);
}

// --- Labels ------------------------------------------------------------

/** Reps in reserve, as written: "2", "1.5", or "5+" from five up. */
function rirText(rpe: number): string {
  const rir = 10 - rpe;
  return rir >= 5 ? '5+' : String(rir);
}

/** The bare number, for a column whose header names the scale: "8.5" / "2". */
export function effortValue(rpe: number, kind: EffortScaleKind): string {
  return kind === 'rir' ? rirText(rpe) : String(rpe);
}

/** A rating wherever a set is written out: "@8.5" / "2 RIR". */
export function effortLabel(rpe: number, kind: EffortScaleKind): string {
  return kind === 'rir' ? `${rirText(rpe)} RIR` : `@${rpe}`;
}

/** The done row's way in when the set is not rated yet. */
export function effortAddLabel(kind: EffortScaleKind): string {
  return kind === 'rir' ? '+ RIR' : '+ RPE';
}

/** Last session's rating, under PREV before the set is done. */
export function effortLastLabel(rpe: number, kind: EffortScaleKind): string {
  return `last ${effortLabel(rpe, kind)}`;
}

/** What the rest bar folds to after a tap. */
export function effortSavedLabel(rpe: number, kind: EffortScaleKind): string {
  return `${effortLabel(rpe, kind)} saved`;
}

/** The rest bar's question about the set just ticked. */
export function effortAsk(badge: string, kind: EffortScaleKind): string {
  return `SET ${badge} · ${kind === 'rir' ? 'REPS LEFT?' : 'HOW HARD?'}`;
}

/** The one anchor that teaches the scale before it is touched. */
export function effortHint(kind: EffortScaleKind): string {
  return kind === 'rir' ? '0 = NOTHING LEFT' : '8 = 2 REPS LEFT';
}

/** "1 REP LEFT", "1–2 REPS LEFT", "NOTHING LEFT", "5+ REPS LEFT". */
function repsLeft(rpe: number): string {
  const rir = 10 - rpe;
  if (rir <= 0) return 'NOTHING LEFT';
  if (rir >= 5) return '5+ REPS LEFT';
  if (!Number.isInteger(rir)) return `${Math.floor(rir)}–${Math.ceil(rir)} REPS LEFT`;
  return rir === 1 ? '1 REP LEFT' : `${rir} REPS LEFT`;
}

/**
 * The meaning of the value under the thumb while scrubbing. In RIR the value
 * already is the meaning, so it is not said twice.
 */
export function effortMeaning(rpe: number, kind: EffortScaleKind): string {
  return kind === 'rir' ? repsLeft(rpe) : `@${rpe} · ${repsLeft(rpe)}`;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five'];

/** The same meaning as a sentence, for the sheet. */
export function effortSentence(rpe: number, kind: EffortScaleKind): string {
  const rir = 10 - rpe;
  let tank: string;
  if (rir <= 0) tank = 'nothing left';
  else if (rir >= 5) tank = 'five or more reps left';
  else if (rir === 0.5) tank = 'maybe one rep left';
  else if (!Number.isInteger(rir)) tank = `about ${WORDS[Math.floor(rir)]} to ${WORDS[Math.ceil(rir)]} reps left`;
  else tank = `about ${WORDS[rir]} ${rir === 1 ? 'rep' : 'reps'} left`;
  return `${effortLabel(rpe, kind)} · ${tank} in the tank.`;
}

// --- The set row's second line ----------------------------------------

export type EffortRowLine = {
  /** `last`: last session's rating. `today`: this set's. `add`: not rated yet. */
  kind: 'last' | 'today' | 'add';
  text: string;
};

/**
 * What the PREV cell's second line says about effort, or null when it says
 * nothing — which is always the case with the feature off, so the row is then
 * exactly the row that shipped.
 *
 * Before the tick a progression suggestion owns the line: it already accounts
 * for how the last session went. After the tick the suggestion is gone and the
 * line is today's rating, or the way in to give one.
 */
export function effortRowLine(input: {
  mode: EffortMode;
  done: boolean;
  /** This set's rating. */
  rpe: number | null | undefined;
  /** The same set's rating last session. */
  prevRpe: number | null | undefined;
  /** A suggestion is showing for this set. */
  hasSuggestion: boolean;
}): EffortRowLine | null {
  const { mode, done, rpe, prevRpe, hasSuggestion } = input;
  if (mode === 'off') return null;
  if (done) {
    return rpe != null
      ? { kind: 'today', text: effortLabel(rpe, mode) }
      : { kind: 'add', text: effortAddLabel(mode) };
  }
  if (hasSuggestion) return null;
  // Rated from the keypad before ticking: that is already today's answer.
  if (rpe != null) return { kind: 'today', text: effortLabel(rpe, mode) };
  if (prevRpe != null) return { kind: 'last', text: effortLastLabel(prevRpe, mode) };
  return null;
}

// --- When the rest bar asks -------------------------------------------

/**
 * Whether ticking a set should put the question in the rest bar. It rides on
 * the rest that the tick starts, so with the rest timer off, or mid-superset
 * where no rest fires, there is nowhere to ask and nothing is asked.
 */
export function shouldPromptEffort(
  mode: EffortMode,
  rest: { startRest: boolean; seconds: number },
): boolean {
  return mode !== 'off' && rest.startRest && rest.seconds > 0;
}
