/**
 * What a screen reader says for a set row's controls.
 *
 * The weight and reps fields and the tick had no label at all: VoiceOver read
 * a row as "text field, text field, button", the same for every set on the
 * screen. Each now names its set, so a row can be told from the next, and the
 * tick says what it will do.
 *
 * Pure, so `node --test` covers it. See setRowLabels.test.ts.
 */

/** `badge` is what the row's badge shows: "1", "2", or "W", "D", "F". */
const setName = (badge: string): string => `set ${badge}`;

/** The weight field. `unit` is the unit it is typed in ("kg" or "lb"). */
export function weightFieldLabel(badge: string, unit: string): string {
  return `Weight in ${unit}, ${setName(badge)}`;
}

export function repsFieldLabel(badge: string): string {
  return `Reps, ${setName(badge)}`;
}

/** The tick: an action, so it reads as what a tap does next. */
export function doneToggleLabel(badge: string, done: boolean): string {
  return done ? `Mark ${setName(badge)} not done` : `Complete ${setName(badge)}`;
}
