/**
 * Snapping a computed weight to one the user can actually pick up — for the
 * warm-up ramp and the 1RM percentage table, which both multiply a weight by a
 * percentage and get something nobody can load.
 *
 * Every rounder here takes kilograms and returns kilograms, because that is
 * what the callers hold and store. The rounding itself happens in the user's
 * unit: a pound lifter gets whole pound plates and 5 lb jumps, returned as the
 * kg value that reads back as exactly that number. In kilograms these are the
 * same sums the sheets did before pounds existed.
 */
import { loadToKg, solvePlatesForKg, type BarSetup } from './plateMath.ts';
import { toDisplay, toKg, WEIGHT_STEPS, type Unit } from './units.ts';

type Rounder = (kg: number) => number;

/**
 * Fixed jumps for a warm-up on equipment with no plates to count. Dumbbells
 * and the like move to the next size on the rack; a machine stack is coarser.
 */
const WARMUP_STEPS: Record<Unit, { machine: number; other: number }> = {
  kg: { machine: 5, other: WEIGHT_STEPS.kg.dumbbell },
  lb: { machine: 10, other: WEIGHT_STEPS.lb.dumbbell },
};

/**
 * Down to the nearest weight this rack can make, never under the bar. Down, not
 * to the nearest: a warm-up — or a planned percentage — erring heavy is the
 * wrong error.
 */
function barbellRounder(setup: BarSetup): Rounder {
  return (kg) => {
    const s = solvePlatesForKg(kg, setup);
    if (s.kind === 'exact') return loadToKg(s.load.totalKg, setup);
    if (s.kind === 'below-bar') return loadToKg(setup.barKg, setup);
    return loadToKg(s.below?.totalKg ?? s.above?.totalKg ?? setup.barKg, setup);
  };
}

/** To the nearest multiple of `step`, counted in `unit`; at least `min`. */
function stepRounder(step: number, unit: Unit, min = 0): Rounder {
  const snap = (n: number) => Math.max(min, Math.round(n / step) * step);
  if (unit === 'kg') return snap;
  return (kg) => toKg(snap(toDisplay(kg, unit) ?? 0), unit) ?? 0;
}

/**
 * How a warm-up weight snaps, per equipment. A barbell can make whatever the
 * plates in the user's inventory allow; everything else comes in fixed jumps,
 * so rounding to a neat number is the closest thing to honest.
 */
export function warmupRounder(equipment: string, setup: BarSetup, unit: Unit): Rounder {
  if (equipment === 'barbell') return barbellRounder(setup);
  const step = equipment === 'machine' ? WARMUP_STEPS[unit].machine : WARMUP_STEPS[unit].other;
  return stepRounder(step, unit, step);
}

/**
 * How a 1RM percentage snaps: to the user's plates when the lift is known to be
 * a barbell one, otherwise to the plain bar step of their unit (2.5 kg / 5 lb).
 */
export function percentageRounder(barbell: boolean, setup: BarSetup, unit: Unit): Rounder {
  return barbell ? barbellRounder(setup) : stepRounder(WEIGHT_STEPS[unit].bar, unit);
}
