/**
 * What to hang on the bar to make a target weight.
 *
 * Only barbell work has plate maths — dumbbells and machines come in whatever
 * increments they come in — so the caller decides whether to ask at all.
 *
 * Everything is computed in grams. Plate sets are full of quarters and halves
 * (1.25, 2.5, 37.5…), and in floating point 20 + 1.25 * 2 is not reliably 22.5;
 * a calculator that occasionally says a loadable weight isn't loadable is worse
 * than no calculator. Grams are exact for every plate anyone sells.
 *
 * The solver itself is unit-blind: it adds and compares numbers and never
 * converts one. Hand it a pound rack and a pound target and it answers in whole
 * pound plates (the "grams" are then thousandths of a pound, exact for the same
 * reason). So the fields named `kg` below hold kilograms on a kg rack and
 * pounds on a lb one — `setupUnit` says which. The names are kept because the
 * stored setup uses them, and a rename would be a migration.
 *
 * Storage is kilograms regardless. `solvePlatesForKg` and `loadToKg` are the
 * way in and out for callers holding a stored weight.
 */
import { toDisplay, toKg, type Unit } from './units.ts';

/** `count` is how many PAIRS the gym has — plates are loaded symmetrically. */
export type PlatePair = { kg: number; count: number };
/**
 * `unit` is what the bar and plates are denominated in. Absent means kilograms:
 * every setup saved before pounds existed has no such field, and must go on
 * meaning what it meant.
 */
export type BarSetup = { barKg: number; pairs: PlatePair[]; unit?: Unit };

/** Plates for ONE side, heaviest first. `n` is how many of that plate per side. */
export type PlateStack = { kg: number; n: number }[];
export type PlateLoad = { totalKg: number; perSideKg: number; plates: PlateStack };

/**
 * `below`/`above` are the nearest loadable weights either side of a target that
 * can't be made. Either is null when the gym has nothing in that direction.
 */
export type PlateSolution =
  | { kind: 'exact'; load: PlateLoad }
  | { kind: 'rounded'; below: PlateLoad | null; above: PlateLoad | null; stepKg: number }
  | { kind: 'below-bar'; barKg: number };

/** A common commercial kg set. Counts are "enough that they never bind". */
export const DEFAULT_BAR_SETUP: BarSetup = {
  barKg: 20,
  pairs: [
    { kg: 25, count: 8 },
    { kg: 20, count: 8 },
    { kg: 15, count: 8 },
    { kg: 10, count: 8 },
    { kg: 5, count: 8 },
    { kg: 2.5, count: 8 },
    { kg: 1.25, count: 8 },
  ],
};

/** A common commercial lb set, with the same never-binding counts. */
export const DEFAULT_LB_BAR_SETUP: BarSetup = {
  unit: 'lb',
  barKg: 45,
  pairs: [
    { kg: 45, count: 8 },
    { kg: 35, count: 8 },
    { kg: 25, count: 8 },
    { kg: 10, count: 8 },
    { kg: 5, count: 8 },
    { kg: 2.5, count: 8 },
  ],
};

/** Bars people actually train on in each unit, heaviest first. */
export const BAR_OPTIONS: Record<Unit, number[]> = {
  kg: [20, 15, 10],
  lb: [45, 35, 15],
};

/** The standard set for a unit — what a user who has saved nothing gets. */
export function defaultBarSetup(unit: Unit): BarSetup {
  return unit === 'lb' ? DEFAULT_LB_BAR_SETUP : DEFAULT_BAR_SETUP;
}

/** The unit a setup's bar and plates are in. */
export function setupUnit(setup: BarSetup): Unit {
  return setup.unit === 'lb' ? 'lb' : 'kg';
}

const g = (kg: number) => Math.round(kg * 1000);
const kg = (grams: number) => grams / 1000;

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * Reads a stored bar setup back, falling back to the default for anything it
 * can't use.
 *
 * The inventory is hand-edited and outlives app versions, so this is the one
 * place that treats it as untrusted. A setup that silently loses a plate is
 * better than a calculator that throws on a corrupt value mid-set — and a bar of
 * zero would make every weight loadable, which is worse than being wrong.
 *
 * A zero `count` survives: that is a plate the gym is known NOT to have, and the
 * settings screen needs the row to stay visible so it can be turned back on.
 *
 * `unit` is the slot the blob was read from, and it decides both the fallback
 * and what the numbers mean — not anything inside the blob. A kg setup is
 * returned without a `unit` field, exactly as it always was.
 */
export function parseBarSetup(raw: string | null | undefined, unit: Unit = 'kg'): BarSetup {
  const fallback = defaultBarSetup(unit);
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Partial<BarSetup>;
    if (!positive(data.barKg)) return fallback;
    const pairs = (Array.isArray(data.pairs) ? data.pairs : [])
      .filter(
        (p): p is PlatePair =>
          !!p &&
          positive((p as PlatePair).kg) &&
          typeof (p as PlatePair).count === 'number' &&
          Number.isFinite((p as PlatePair).count) &&
          (p as PlatePair).count >= 0,
      )
      .map((p) => ({ kg: p.kg, count: Math.floor(p.count) }));
    return unit === 'kg' ? { barKg: data.barKg, pairs } : { unit, barKg: data.barKg, pairs };
  } catch {
    return fallback;
  }
}

/**
 * The smallest amount the bar can move: the lightest available plate, doubled
 * because it goes on both ends. This is the number to quote when a target is
 * unloadable — "the smallest plate is 1.25 kg, so it goes up in 2.5 kg steps"
 * explains the gap in a way the rounded weights alone don't.
 */
export function smallestStepKg(setup: BarSetup): number {
  const usable = setup.pairs.filter((p) => p.count > 0 && p.kg > 0);
  if (usable.length === 0) return 0;
  return Math.min(...usable.map((p) => p.kg)) * 2;
}

/**
 * Every per-side weight this inventory can make, mapped to the plates that make
 * it — a bounded subset sum, keeping the heaviest-plates-first stack for each
 * reachable total.
 *
 * Not greedy. Greedy is right for a full commercial set and wrong the moment a
 * gym runs out: with one each of 20/15/10, greedy takes the 20 for a 25 kg side
 * and is stuck, while 15 + 10 sits right there.
 */
function reachable(setup: BarSetup): Map<number, PlateStack> {
  const pairs = setup.pairs
    .filter((p) => p.count > 0 && p.kg > 0)
    .slice()
    .sort((a, b) => b.kg - a.kg);

  let sums = new Map<number, PlateStack>([[0, []]]);
  for (const pair of pairs) {
    const next = new Map(sums);
    for (const [sum, stack] of sums) {
      for (let n = 1; n <= pair.count; n += 1) {
        const total = sum + g(pair.kg) * n;
        const rival = next.get(total);
        if (!rival || prefers([...stack, { kg: pair.kg, n }], rival)) {
          next.set(total, [...stack, { kg: pair.kg, n }]);
        }
      }
    }
    sums = next;
  }
  return sums;
}

/**
 * Which of two stacks making the same weight a lifter would rather load.
 *
 * Compare the plates in descending order and take the first that differs, so
 * 25 + 15 beats 20 + 20 and 25 + 25 + 10 beats 25 + 20 + 15. That is what people
 * actually do: reach for the biggest plate that still fits, because it's fewer
 * plates to handle and it's what the bar looks like in every gym.
 *
 * Arriving at the same weight with fewer plates wins ties, since a stack that
 * ran out of plates to compare has nothing left to add.
 */
function prefers(a: PlateStack, b: PlateStack): boolean {
  const expand = (s: PlateStack) => s.flatMap((p) => Array<number>(p.n).fill(p.kg));
  const x = expand(a);
  const y = expand(b);
  for (let i = 0; i < Math.min(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return x.length < y.length;
}

const toLoad = (perSideG: number, stack: PlateStack, barG: number): PlateLoad => ({
  totalKg: kg(barG + perSideG * 2),
  perSideKg: kg(perSideG),
  plates: stack,
});

/**
 * How to make `targetKg` on this bar, or the loadable weights either side of it.
 *
 * A target under the bar isn't a rounding problem — no arrangement of plates
 * makes the bar lighter — so it gets its own answer for the caller to explain.
 */
export function solvePlates(targetKg: number, setup: BarSetup): PlateSolution {
  const barG = g(setup.barKg);
  const targetG = g(targetKg);
  if (targetG < barG) return { kind: 'below-bar', barKg: setup.barKg };

  // Plates are symmetric, so an odd number of grams over the bar is unloadable
  // whatever the inventory. Floor it; `above` picks up the other side.
  const overG = targetG - barG;
  const perSideTargetG = Math.floor(overG / 2);

  const sums = reachable(setup);
  if (overG % 2 === 0) {
    const hit = sums.get(perSideTargetG);
    if (hit) return { kind: 'exact', load: toLoad(perSideTargetG, hit, barG) };
  }

  let belowG: number | null = null;
  let aboveG: number | null = null;
  for (const sum of sums.keys()) {
    if (sum <= perSideTargetG && (belowG === null || sum > belowG)) belowG = sum;
    if (sum * 2 + barG > targetG && (aboveG === null || sum < aboveG)) aboveG = sum;
  }

  return {
    kind: 'rounded',
    below: belowG === null ? null : toLoad(belowG, sums.get(belowG)!, barG),
    above: aboveG === null ? null : toLoad(aboveG, sums.get(aboveG)!, barG),
    stepKg: smallestStepKg(setup),
  };
}

/**
 * `solvePlates` for a weight held in kilograms — which is every stored weight.
 *
 * The answer is in the rack's unit, not in kg: on a pound rack a stored
 * 102.0583 kg is the 225 lb it was typed as, and comes back as two 45s a side.
 * On a kg rack this is `solvePlates` and nothing else.
 */
export function solvePlatesForKg(targetKg: number, setup: BarSetup): PlateSolution {
  const unit = setupUnit(setup);
  if (unit === 'kg') return solvePlates(targetKg, setup);
  return solvePlates(toDisplay(targetKg, unit) ?? NaN, setup);
}

/**
 * A weight in the rack's unit (a load's total, the bar) -> kilograms for
 * storage. A pound load becomes the kg value that reads back as exactly that
 * many pounds, so choosing 225 lb never lands the set on 224.99.
 */
export function loadToKg(amount: number, setup: BarSetup): number {
  return toKg(amount, setupUnit(setup)) ?? amount;
}
