/**
 * Body measurements: what each metric measures, and how its canonical value is
 * shown, parsed and differenced.
 *
 * Storage is always canonical — cm for lengths, kg for masses, a plain number
 * for percents. Nothing here converts on the way into the database; display
 * converts on the way out, the same split units.ts already draws for weight.
 */
import { getLang } from '../i18n/current.ts';
import type { Lang } from '../i18n/locale.ts';
import { type Unit, localizeNumber, toDisplay as weightToDisplay, toKg as weightToKg } from './units.ts';

export type MetricId =
  | 'waist'
  | 'chest'
  | 'arms'
  | 'thighs'
  | 'calves'
  | 'shoulders'
  | 'hips'
  | 'neck'
  // OPEN DECISION (handoff 8a, "bodyweight joining the series"): bodyweight is
  // already stored in SecureStore by lib/bodyweight.ts, where the volume maths
  // reads it. Nothing consumes this metric yet, so there is no duplication
  // today — but wiring it up must MOVE that store, not add a second one.
  | 'bodyweight'
  | 'bodyFat';

export type Dimension = 'length' | 'mass' | 'percent';
export type LengthUnit = 'cm' | 'in';

/** Weight unit is the user's global setting; length follows it unless overridden. */
export type UnitPrefs = { weightUnit: Unit; lengthUnit?: LengthUnit };

const _DIMENSIONS: Record<MetricId, Dimension> = {
  waist: 'length',
  chest: 'length',
  arms: 'length',
  thighs: 'length',
  calves: 'length',
  shoulders: 'length',
  hips: 'length',
  neck: 'length',
  bodyweight: 'mass',
  bodyFat: 'percent',
};

export const METRICS = Object.keys(_DIMENSIONS) as MetricId[];

const _CM_PER_IN = 2.54;

/**
 * Decimals a dimension is always shown to. Fixed, not significant-figure based:
 * a tenth wobbling in and out of the string makes a column of readings jump.
 */
const _PRECISION: Record<Dimension, number> = { length: 1, mass: 1, percent: 1 };

/** Digits kept on a display value before the user sees it in an input field. */
const _DISPLAY_DP = 2;

const _round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function dimensionOf(metric: MetricId): Dimension {
  return _DIMENSIONS[metric];
}

/** Imperial weight implies imperial lengths, until the user says otherwise. */
export function lengthUnitFor(prefs: UnitPrefs): LengthUnit {
  return prefs.lengthUnit ?? (prefs.weightUnit === 'lb' ? 'in' : 'cm');
}

export function unitFor(metric: MetricId, prefs: UnitPrefs): string {
  switch (dimensionOf(metric)) {
    case 'length':
      return lengthUnitFor(prefs);
    case 'mass':
      return prefs.weightUnit;
    case 'percent':
      return '%';
  }
}

/** Canonical -> display, unrounded; the exported entry points round. */
function _convertOut(canonical: number, metric: MetricId, prefs: UnitPrefs): number {
  switch (dimensionOf(metric)) {
    case 'length':
      return lengthUnitFor(prefs) === 'in' ? canonical / _CM_PER_IN : canonical;
    case 'mass':
      return prefs.weightUnit === 'lb' ? (weightToDisplay(canonical, 'lb') as number) : canonical;
    case 'percent':
      return canonical;
  }
}

export function toDisplay(
  canonical: number,
  metric: MetricId,
  prefs: UnitPrefs,
): { value: number; unit: string } {
  return {
    value: _round(_convertOut(canonical, metric, prefs), _DISPLAY_DP),
    unit: unitFor(metric, prefs),
  };
}

// One unsigned decimal number. A bare trailing point ("84.") and a bare leading
// one (".5") are half-typed, not malformed, so both parse. Exponents, signs and
// stray characters do not: no body measurement is negative or written as 1e5.
const _NUMERIC = /^(\d+(\.\d*)?|\.\d+)$/;

/**
 * Display string -> canonical number, or null if it is not a number at all.
 *
 * The comma swap is the point: a comma-locale keypad emits "24,8", and
 * parseFloat stops at the comma and silently returns 24 — a measurement wrong
 * by a factor of ten with nothing to show for it.
 */
export function toCanonical(input: string, metric: MetricId, prefs: UnitPrefs): number | null {
  const cleaned = input.trim().replace(',', '.');
  if (!_NUMERIC.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;

  switch (dimensionOf(metric)) {
    case 'length':
      return _round(lengthUnitFor(prefs) === 'in' ? n * _CM_PER_IN : n, 4);
    case 'mass':
      return prefs.weightUnit === 'lb' ? (weightToKg(n, 'lb') as number) : n;
    case 'percent':
      return _round(n, 4);
  }
}

export function formatMeasurement(
  canonical: number,
  metric: MetricId,
  prefs: UnitPrefs,
  lang: Lang = getLang(),
): string {
  const dp = _PRECISION[dimensionOf(metric)];
  return `${localizeNumber(_convertOut(canonical, metric, prefs).toFixed(dp), lang)} ${unitFor(metric, prefs)}`;
}

/**
 * The change from one reading to the next, signed and in display units.
 *
 * Signed only. Which direction counts as progress depends on the metric and on
 * the person, so the caller gets a number and a sign and nothing else — no
 * good/bad flag, no colour hint. A change too small to survive the dimension's
 * fixed precision reads as a plain zero rather than a signed near-nothing.
 */
export function deltaBetween(
  from: number,
  to: number,
  metric: MetricId,
  prefs: UnitPrefs,
  lang: Lang = getLang(),
): string {
  const dp = _PRECISION[dimensionOf(metric)];
  const diff = _round(_convertOut(to, metric, prefs) - _convertOut(from, metric, prefs), dp);
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  return `${sign}${localizeNumber(Math.abs(diff).toFixed(dp), lang)} ${unitFor(metric, prefs)}`;
}
