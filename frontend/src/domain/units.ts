/** Display-only unit conversion. Storage is always kilograms (canonical). */

export type Unit = 'kg' | 'lb';

const _KG_PER_LB = 0.45359237;

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
