/**
 * What a bodyweight is stored as. Split from bodyweight.ts, which reads and
 * writes SecureStore, so `node --test` covers the rule. See bodyweightValue.test.ts.
 */

/** Plausible human bodyweight bounds (kg). Outside this, treat as unset. */
const BW_MIN = 20;
const BW_MAX = 500;

/** Whether `kg` can be a person's bodyweight at all. */
export const bodyweightInRange = (kg: number): boolean =>
  Number.isFinite(kg) && kg >= BW_MIN && kg <= BW_MAX;

/**
 * The kilograms to store for `kg`, or null when it is out of range.
 *
 * Four decimals, as `toKg` keeps for a set's weight, and for the same reason:
 * a bodyweight typed in pounds has to read back as typed. One decimal of a
 * kilogram is a quarter of a pound, so 180 lb came back as 179.9. It still
 * trims the float noise a conversion or a Health reading can carry.
 */
export function bodyweightToStore(kg: number): number | null {
  if (!bodyweightInRange(kg)) return null;
  return Math.round(kg * 10000) / 10000;
}
