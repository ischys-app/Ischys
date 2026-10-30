/**
 * Supersets: a group of exercises trained in rounds (#53, board 11a).
 *
 * Deliberately a *grouping*, not a set type. `workout_exercises.superset_group`
 * has existed all along and import/export have been carrying it — nothing has
 * ever read it, so workouts imported with supersets have been quietly losing
 * their structure on screen.
 *
 * The rule that makes a superset a superset is the rest: you alternate through
 * the partners and rest once at the end of the round, not after each exercise.
 * Everything here exists to work out when that moment is.
 *
 * Pure, so `node --test` covers it.
 */

type SetLike = { id: string; type: string; done: boolean };

export type SupersetExercise = {
  id: string;
  /** Null for an ordinary exercise. Partners share a value. */
  supersetGroup: number | null;
  /** This exercise's own rest, in seconds. */
  rest: number;
  sets: readonly SetLike[];
};

/**
 * Group id → display letter, by order of first appearance.
 *
 * The stored id is an opaque number; the screen says "SUPERSET A". Lettering by
 * appearance keeps the labels stable as you scroll and matches reading order.
 */
export function groupLabels(exercises: readonly SupersetExercise[]): Map<number, string> {
  const out = new Map<number, string>();
  let next = 0;
  for (const ex of exercises) {
    if (ex.supersetGroup == null || out.has(ex.supersetGroup)) continue;
    out.set(ex.supersetGroup, String.fromCharCode(65 + next));
    next += 1;
  }
  return out;
}

/**
 * Which round a set belongs to, 1-based, or null when it belongs to none.
 *
 * Rounds count working sets. Warm-ups sit outside them — you don't alternate a
 * warm-up with your partner — and drop and failure sets ride along with the
 * working set they extend, because they're the same effort continued rather
 * than a new trip round the group.
 */
export function roundOfSet(sets: readonly SetLike[], setId: string): number | null {
  let round = 0;
  for (const s of sets) {
    if (s.type === 'warmup') {
      if (s.id === setId) return null;
      continue;
    }
    if (s.type === 'normal') round += 1;
    // A drop/failure opening the list has nothing to extend; call it round 1.
    if (s.id === setId) return Math.max(1, round);
  }
  return null;
}

/** The exercise and its partners in screen order; just itself when ungrouped. */
export function supersetPartners(
  exercises: readonly SupersetExercise[],
  exerciseId: string,
): SupersetExercise[] {
  const me = exercises.find((e) => e.id === exerciseId);
  if (!me) return [];
  if (me.supersetGroup == null) return [me];
  return exercises.filter((e) => e.supersetGroup === me.supersetGroup);
}

/** True when this exercise has a set belonging to `round`. */
function hasRound(ex: SupersetExercise, round: number): boolean {
  return ex.sets.some((s) => roundOfSet(ex.sets, s.id) === round);
}

export type RestDecision = {
  startRest: boolean;
  /** Seconds to rest for. 0 when no rest starts. */
  seconds: number;
  /** Partner to move the active bar to, or null to stay put. */
  nextExerciseId: string | null;
};

/**
 * What should happen after a set is logged.
 *
 * For an ordinary exercise this is the behaviour that always shipped: rest for
 * its own duration. Inside a superset, rest waits until the round is actually
 * over — finishing the first partner sends you to the second rather than
 * starting a timer, which is the whole point of pairing them.
 *
 * The round is closed by the last partner that still HAS a set in it. Uneven
 * groups are allowed, so that isn't always the last partner in the group, and
 * whoever closes the round owns the rest — resting on a partner who has already
 * finished their sets would be waiting for nothing.
 */
export function restAfterSet(
  exercises: readonly SupersetExercise[],
  exerciseId: string,
  setId: string,
): RestDecision {
  const me = exercises.find((e) => e.id === exerciseId);
  if (!me) return { startRest: false, seconds: 0, nextExerciseId: null };

  const partners = supersetPartners(exercises, exerciseId);
  const round = roundOfSet(me.sets, setId);

  // Solo exercise, or a warm-up — which belongs to no round, so there is no
  // handoff to make and the usual rest applies.
  if (partners.length < 2 || round == null) {
    return { startRest: true, seconds: me.rest, nextExerciseId: null };
  }

  const inRound = partners.filter((p) => hasRound(p, round));
  const closer = inRound[inRound.length - 1] ?? me;

  if (closer.id !== exerciseId) {
    // Hand over to the next partner that still owes a set this round.
    const idx = partners.findIndex((p) => p.id === exerciseId);
    const next = partners.slice(idx + 1).find((p) => hasRound(p, round)) ?? null;
    return { startRest: false, seconds: 0, nextExerciseId: next?.id ?? null };
  }

  // Round closed: rest, then back to whoever starts the next one.
  const nextRoundLead = partners.find((p) => hasRound(p, round + 1)) ?? null;
  return { startRest: true, seconds: closer.rest, nextExerciseId: nextRoundLead?.id ?? null };
}

/**
 * The exercises with any group that holds only one of them cleared: a superset
 * of one is not a superset. What is left after a partner is removed.
 */
export function withoutLoneGroups<T extends { supersetGroup: number | null }>(exercises: readonly T[]): T[] {
  const size = new Map<number, number>();
  for (const e of exercises) {
    if (e.supersetGroup != null) size.set(e.supersetGroup, (size.get(e.supersetGroup) ?? 0) + 1);
  }
  return exercises.map((e) =>
    e.supersetGroup != null && (size.get(e.supersetGroup) ?? 0) < 2 ? { ...e, supersetGroup: null } : e,
  );
}
