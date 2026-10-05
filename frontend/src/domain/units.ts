/**
 * Weight units. Storage is always kilograms (canonical); everything here
 * converts at the edge — on the way out to a label or an input, and on the way
 * back in from something the user typed.
 *
 * Every surface that shows or accepts a lifting weight goes through this file,
 * so no screen prints a unit of its own. Pure — no imports, so `node --test`
 * can run it. The preference itself is read through lib/weightUnit.ts.
 */

export type Unit = 'kg' | 'lb';

const _KG_PER_LB = 0.45359237;

/**
 * Kilograms -> the user's unit, rounded to 2 decimals.
 *
 * Together with `toKg`'s 4 decimals this round-trips anything typed to two
 * decimals in lb: storing to 0.0001 kg moves the value by at most 0.00011 lb,
 * far inside the 0.005 lb the display rounding absorbs. So 225 lb is stored as
 * 102.0583 kg and reads back as exactly 225.
 */
export function toDisplay(weightKg: number | null, unit: Unit): number | null {
  if (weightKg === null) return null;
  if (unit === 'lb') return Math.round((weightKg / _KG_PER_LB) * 100) / 100;
  return Math.round(weightKg * 100) / 100;
}

/** Normalize an entered weight to kilograms for storage. */
export function toKg(weight: number | null, unit: Unit): number | null {
  if (weight === null) return null;
  if (unit === 'lb') return Math.round(weight * _KG_PER_LB * 10000) / 10000;
  return weight;
}

/** "KG" / "LB" — column headers. */
export function unitLabel(unit: Unit): string {
  return unit.toUpperCase();
}

/**
 * A stored weight as the bare number shown in an input or beside a unit label:
 * "225", "42.5". Blank for an unlogged (null) weight.
 */
export function weightText(weightKg: number | null | undefined, unit: Unit): string {
  if (weightKg == null) return '';
  return String(toDisplay(weightKg, unit));
}

/** A stored weight with its unit: "225 lb". */
export function formatWeight(weightKg: number, unit: Unit): string {
  return `${weightText(weightKg, unit)} ${unit}`;
}

/**
 * Parse a typed weight, or null when it is blank or not a number.
 *
 * `decimal-pad` inserts the device's locale decimal separator, so a
 * comma-locale keyboard yields "24,8" — and `parseFloat` stops at the comma and
 * silently drops the fraction. Normalise the comma before parsing.
 */
export function parseWeight(text: string | null | undefined): number | null {
  const n = parseFloat(String(text ?? '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

/** Text typed in the user's unit -> kilograms for storage; null when blank. */
export function inputToKg(text: string | null | undefined, unit: Unit): number | null {
  return toKg(parseWeight(text), unit);
}

/**
 * Re-express text typed in one unit in another, for a unit switched while a
 * workout is open. Blank or unparseable text is returned untouched, as is
 * everything when the unit has not actually changed — so a half-typed "84."
 * is never rewritten under the user.
 */
export function convertWeightText(text: string, from: Unit, to: Unit): string {
  if (from === to) return text;
  const kg = inputToKg(text, from);
  return kg === null ? text : weightText(kg, to);
}

/** Kilograms of volume -> the user's unit. Unrounded; the formatters round. */
export function volumeToDisplay(volumeKg: number, unit: Unit): number {
  return unit === 'lb' ? volumeKg / _KG_PER_LB : volumeKg;
}

/**
 * Thousands-separated volume as a bare number, e.g. "9,177" — for layouts that
 * style the unit separately. Manual grouping: Hermes' Intl may omit the
 * separator, so this doesn't rely on toLocaleString.
 */
export function volumeText(volumeKg: number, unit: Unit): string {
  return String(Math.round(volumeToDisplay(volumeKg, unit))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );
}

/** Thousands-separated volume with its unit, e.g. "9,177 kg". */
export function formatVolume(volumeKg: number, unit: Unit): string {
  return `${volumeText(volumeKg, unit)} ${unit}`;
}

/**
 * The smallest sensible jump in each unit, for anything that steps a weight
 * (the progression suggestion). Whole plates of that system — 5 lb, not the
 * 5.51 lb that 2.5 kg converts to. `bar` is the fallback when the user's own
 * plate inventory doesn't say; `dumbbell` is the next common size on a rack.
 */
export const WEIGHT_STEPS: Record<Unit, { bar: number; dumbbell: number }> = {
  kg: { bar: 2.5, dumbbell: 2 },
  lb: { bar: 5, dumbbell: 5 },
};
