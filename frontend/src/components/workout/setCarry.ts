/**
 * Carry-forward for set rows.
 *
 * Type the first set of an exercise and every set below it shows those numbers
 * as placeholders. Complete one without typing anything and the placeholder is
 * what gets logged — you only touch the rows that differ.
 *
 * Carries from the *nearest preceding filled* set, not strictly the first, so
 * editing set 2 propagates down to 3 and 4. Weight and reps carry independently:
 * a bodyweight exercise has reps but no weight.
 *
 * Pure — no imports, so `node --test` can run it. See setCarry.test.ts.
 */

export type SetValues = { weight: string; reps: string };
export type Carry = { weight: string | undefined; reps: string | undefined };

const filled = (v: string | undefined): boolean => typeof v === 'string' && v.trim() !== '';

/** The values a set at `index` should show as placeholders. */
export function carryFor(sets: readonly SetValues[], index: number): Carry {
  let weight: string | undefined;
  let reps: string | undefined;

  // Walk upward; the first filled value wins for each column independently.
  for (let i = index - 1; i >= 0; i--) {
    if (weight === undefined && filled(sets[i].weight)) weight = sets[i].weight;
    if (reps === undefined && filled(sets[i].reps)) reps = sets[i].reps;
    if (weight !== undefined && reps !== undefined) break;
  }

  return { weight, reps };
}

/** What to persist when a set is completed: typed values, else the carry. */
export function resolveSet(set: SetValues, carry: Carry): SetValues {
  return {
    weight: filled(set.weight) ? set.weight : carry.weight ?? '',
    reps: filled(set.reps) ? set.reps : carry.reps ?? '',
  };
}

/** '' → null (server "unlogged"), otherwise a number. */
const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export type CompletionPatch = { weight?: number | null; reps?: number | null };

/**
 * Everything needed to complete the set at `index`: the values it will log, and
 * the PATCH body carrying only the columns the carry actually changed.
 *
 * Completing a set can be initiated from the workout screen or from the Live
 * Activity's ✓, in different processes and with different local state. Both go
 * through here so a set logs the same numbers either way — the rule lives once.
 */
export function completionPatch(
  sets: readonly SetValues[],
  index: number,
): { filled: SetValues; patch: CompletionPatch } {
  const resolved = resolveSet(sets[index], carryFor(sets, index));
  const patch: CompletionPatch = {};
  if (resolved.weight !== sets[index].weight) patch.weight = numOrNull(resolved.weight);
  if (resolved.reps !== sets[index].reps) patch.reps = numOrNull(resolved.reps);
  return { filled: resolved, patch };
}
