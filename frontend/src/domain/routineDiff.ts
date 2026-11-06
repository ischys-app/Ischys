/**
 * Diffs a finished workout against the routine it started from, so the summary
 * can offer "update the routine to match what you just did".
 *
 * STRUCTURE ONLY: exercises added / removed / reordered, set counts, set types,
 * and rest timers. Never logged actuals (weights, reps) — those differ from
 * targets almost every session, so prompting on them would fire every workout
 * and get dismissed reflexively.
 *
 * Why targets are absent rather than merely excluded: a workout set has a single
 * `weight`/`reps` pair, so an edited *target* is indistinguishable from a logged
 * *actual*. Telling them apart needs a schema change. Set *type* has no such
 * problem — `routine_sets.type` already exists — which is why it is compared.
 *
 * Lives here rather than in the summary screen so it can be tested directly;
 * `node --test` only sees `src/`.
 */
import type { RoutineOut, WorkoutOut } from '../api/types';
import { t } from '../i18n/t.ts';

export type DiffMarker = 'added' | 'removed' | 'changed';
export type DiffRow = { key: string; marker: DiffMarker; name: string; detail: string };

/** Non-warmup ("working") set count — the unit the diff compares, matching how
 *  `bestSetLine` already excludes warm-ups from what counts. */
export function workingSetCount(sets: { type: string }[]): number {
  return sets.filter((s) => s.type !== 'warmup').length;
}


/** Rest duration for the diff row: "1:30", "45s". */
export function restLabel(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : t('rest.seconds', { n: s });
}

/** Values kept in the longest common subsequence of two id sequences — used to
 *  tell which common exercises actually moved vs. were merely shifted by others. */
function lcsKept(a: string[], b: string[]): Set<string> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keep = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keep.add(a[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return keep;
}

/** How a set type reads inside a diff row. */
const TYPE_KEYS = ['normal', 'warmup', 'drop', 'failure'];
const typeLabel = (type: string) => (TYPE_KEYS.includes(type) ? t(`routineDiff.type.${type}`) : type);

/**
 * The first position where two set-type sequences disagree, or -1 when they
 * match all the way down.
 *
 * Marking a set as drop or to-failure leaves the working-set count untouched, so
 * comparing counts alone never noticed and the "update routine?" prompt never
 * appeared for it. Comparing the sequence is what closes that.
 */
function firstTypeChange(
  routineSets: readonly { type: string }[],
  workoutSets: readonly { type: string }[],
): number {
  const shared = Math.min(routineSets.length, workoutSets.length);
  for (let i = 0; i < shared; i += 1) {
    if (routineSets[i].type !== workoutSets[i].type) return i;
  }
  // Identical as far as both run, but one side has sets the other doesn't — with
  // equal WORKING counts that means a warm-up was added or dropped, and the
  // first unmatched position is the change.
  return routineSets.length === workoutSets.length ? -1 : shared;
}

/**
 * Whether this exercise's superset membership moved.
 *
 * Compared as "grouped or not, and with whom" rather than by raw id: the stored
 * group number is opaque and a workout started fresh can carry different
 * numbers for the same pairing.
 */
function groupingChanged(
  re: { superset_group?: number | null },
  we: { superset_group?: number | null },
): boolean {
  return ((re.superset_group ?? null) === null) !== ((we.superset_group ?? null) === null);
}

export function buildRoutineDiff(routine: RoutineOut, workout: WorkoutOut): DiffRow[] {
  const rExs = routine.exercises;
  const wExs = workout.exercises;
  const rIds = rExs.map((e) => e.exercise.id);
  const wIds = wExs.map((e) => e.exercise.id);
  const rHas = new Set(rIds);
  const wHas = new Set(wIds);
  const rById = new Map(rExs.map((e) => [e.exercise.id, e]));

  // Which common exercises genuinely moved (not just shifted by add/remove).
  const commonR = rIds.filter((id) => wHas.has(id));
  const commonW = wIds.filter((id) => rHas.has(id));
  const kept = lcsKept(commonR, commonW);

  const added: DiffRow[] = [];
  const changed: DiffRow[] = [];
  for (const we of wExs) {
    const id = we.exercise.id;
    if (!rHas.has(id)) {
      added.push({
        key: `add-${we.id}`,
        marker: 'added',
        name: we.exercise.name,
        detail: t('routineDiff.sets', { count: workingSetCount(we.sets) }),
      });
      continue;
    }
    const re = rById.get(id);
    if (!re) continue;
    const wCount = workingSetCount(we.sets);
    const rCount = workingSetCount(re.sets);
    const typeAt = firstTypeChange(re.sets, we.sets);
    if (wCount !== rCount) {
      changed.push({
        key: `set-${we.id}`,
        marker: 'changed',
        name: we.exercise.name,
        detail: t('routineDiff.setsChanged', { from: rCount, to: wCount }),
      });
    } else if (typeAt !== -1) {
      // Same number of working sets, different kinds of them. Checked ahead of
      // rest because "set 3 to failure" describes the session better than a rest
      // tweak made in the same breath.
      const from = re.sets[typeAt];
      const to = we.sets[typeAt];
      changed.push({
        key: `type-${we.id}`,
        marker: 'changed',
        name: we.exercise.name,
        detail: to
          ? from
            ? t('routineDiff.typeChange', { n: typeAt + 1, from: typeLabel(from.type), to: typeLabel(to.type) })
            : t('routineDiff.typeSet', { n: typeAt + 1, to: typeLabel(to.type) })
          : t('routineDiff.setRemoved', { n: typeAt + 1 }),
      });
    } else if (groupingChanged(re, we)) {
      // Pairing exercises into a superset, or breaking one apart, changes how
      // the session is run even when every set is identical — so it is
      // structure, and worth offering to save.
      const nowGrouped = we.superset_group != null;
      changed.push({
        key: `ss-${we.id}`,
        marker: 'changed',
        name: we.exercise.name,
        detail: nowGrouped ? t('routineDiff.nowSuperset') : t('routineDiff.noSuperset'),
      });
    } else if (we.rest_seconds !== re.rest_seconds) {
      changed.push({
        key: `rest-${we.id}`,
        marker: 'changed',
        name: we.exercise.name,
        detail: t('routineDiff.rest', { from: restLabel(re.rest_seconds), to: restLabel(we.rest_seconds) }),
      });
    } else if (!kept.has(id)) {
      changed.push({ key: `move-${we.id}`, marker: 'changed', name: we.exercise.name, detail: t('routineDiff.moved') });
    }
  }

  const removed: DiffRow[] = rExs
    .filter((re) => !wHas.has(re.exercise.id))
    .map((re) => ({ key: `rm-${re.id}`, marker: 'removed' as const, name: re.exercise.name, detail: t('routineDiff.removed') }));

  return [...added, ...removed, ...changed];
}
