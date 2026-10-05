/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BAR_OPTIONS,
  DEFAULT_BAR_SETUP,
  DEFAULT_LB_BAR_SETUP,
  defaultBarSetup,
  loadToKg,
  parseBarSetup,
  setupUnit,
  smallestStepKg,
  solvePlates,
  solvePlatesForKg,
  type BarSetup,
} from './plateMath.ts';
import { weightText } from './units.ts';

/** A full pound set: 45 lb bar, plenty of every plate. */
const gym = DEFAULT_LB_BAR_SETUP;

const exact = (target: number, setup: BarSetup = gym) => {
  const s = solvePlates(target, setup);
  assert.equal(s.kind, 'exact', `expected ${target} lb to be loadable exactly`);
  return s.kind === 'exact' ? s.load : null!;
};

// --- the pound inventory ---

test('the pound set is a 45 lb bar with 45 / 35 / 25 / 10 / 5 / 2.5 pairs', () => {
  assert.equal(setupUnit(gym), 'lb');
  assert.equal(gym.barKg, 45);
  assert.deepEqual(
    gym.pairs.map((p) => p.kg),
    [45, 35, 25, 10, 5, 2.5],
  );
  assert.ok(gym.pairs.every((p) => p.count > 0));
});

test('each unit has its own default set and bar options, heaviest bar first', () => {
  assert.equal(defaultBarSetup('kg'), DEFAULT_BAR_SETUP);
  assert.equal(defaultBarSetup('lb'), DEFAULT_LB_BAR_SETUP);
  assert.equal(setupUnit(DEFAULT_BAR_SETUP), 'kg');
  assert.equal(BAR_OPTIONS.kg[0], 20);
  assert.equal(BAR_OPTIONS.lb[0], 45);
  assert.ok(BAR_OPTIONS.lb.includes(gym.barKg));
});

// --- the solver on pound plates ---

test('135 is a plate a side', () => {
  const load = exact(135);
  assert.deepEqual(load.plates, [{ kg: 45, n: 1 }]);
  assert.equal(load.perSideKg, 45);
  assert.equal(load.totalKg, 135);
});

test('225 and 315 are two and three plates a side', () => {
  assert.deepEqual(exact(225).plates, [{ kg: 45, n: 2 }]);
  assert.deepEqual(exact(315).plates, [{ kg: 45, n: 3 }]);
});

test('185 is a 45 and a 25', () => {
  assert.deepEqual(exact(185).plates, [
    { kg: 45, n: 1 },
    { kg: 25, n: 1 },
  ]);
});

test('the 45 lb bar alone is an exact load with no plates', () => {
  const load = exact(45);
  assert.deepEqual(load.plates, []);
  assert.equal(load.perSideKg, 0);
});

test('a target under the bar reports the 45 lb bar', () => {
  const s = solvePlates(40, gym);
  assert.deepEqual(s, { kind: 'below-bar', barKg: 45 });
});

test('an unloadable target offers whole-pound-plate neighbours 5 lb apart', () => {
  const s = solvePlates(137, gym);
  assert.equal(s.kind, 'rounded');
  if (s.kind !== 'rounded') return;
  assert.equal(s.below?.totalKg, 135);
  assert.equal(s.above?.totalKg, 140);
  assert.equal(s.stepKg, 5);
  assert.deepEqual(s.above?.plates, [
    { kg: 45, n: 1 },
    { kg: 2.5, n: 1 },
  ]);
});

test('without 2.5s the bar moves in 10 lb steps', () => {
  const setup = { ...gym, pairs: gym.pairs.map((p) => (p.kg === 2.5 ? { ...p, count: 0 } : p)) };
  assert.equal(smallestStepKg(setup), 10);
  const s = solvePlates(140, setup);
  assert.equal(s.kind, 'rounded');
  if (s.kind !== 'rounded') return;
  assert.equal(s.below?.totalKg, 135);
  assert.equal(s.above?.totalKg, 145);
});

test('a depleted rack loads 225 from what is left', () => {
  // One pair of 45s: 90 a side has to be 45 + 35 + 10.
  const setup = { ...gym, pairs: gym.pairs.map((p) => (p.kg === 45 ? { ...p, count: 1 } : p)) };
  assert.deepEqual(exact(225, setup).plates, [
    { kg: 45, n: 1 },
    { kg: 35, n: 1 },
    { kg: 10, n: 1 },
  ]);
});

test('a rack that runs out offers no heavier neighbour', () => {
  const setup: BarSetup = { unit: 'lb', barKg: 45, pairs: [{ kg: 45, count: 1 }] };
  const s = solvePlates(225, setup);
  assert.equal(s.kind, 'rounded');
  if (s.kind !== 'rounded') return;
  assert.equal(s.below?.totalKg, 135);
  assert.equal(s.above, null);
});

// --- the kilogram boundary (storage is kg, the rack is not) ---

test('a stored 225 lb is solved as 225 lb, not as 102 kg', () => {
  const s = solvePlatesForKg(102.0583, gym);
  assert.equal(s.kind, 'exact');
  if (s.kind !== 'exact') return;
  assert.equal(s.load.totalKg, 225);
  assert.deepEqual(s.load.plates, [{ kg: 45, n: 2 }]);
});

test('a chosen pound load goes back as the kg that reads as exactly that number', () => {
  for (const lb of [45, 135, 137.5, 225, 315, 405]) {
    assert.equal(weightText(loadToKg(lb, gym), 'lb'), String(lb));
  }
  assert.equal(loadToKg(225, gym), 102.0583);
});

test('a kg-era weight on a pound rack rounds to pound plates', () => {
  // 100 kg reads as 220.46 lb: between 220 and 225.
  const s = solvePlatesForKg(100, gym);
  assert.equal(s.kind, 'rounded');
  if (s.kind !== 'rounded') return;
  assert.equal(s.below?.totalKg, 220);
  assert.equal(s.above?.totalKg, 225);
});

test('15 kg is under a 45 lb bar', () => {
  assert.equal(solvePlatesForKg(15, gym).kind, 'below-bar');
});

test('on a kg rack the boundary changes nothing', () => {
  for (const target of [20, 100, 101, 102.5, 15, 33.333]) {
    assert.deepEqual(
      solvePlatesForKg(target, DEFAULT_BAR_SETUP),
      solvePlates(target, DEFAULT_BAR_SETUP),
    );
    assert.equal(loadToKg(target, DEFAULT_BAR_SETUP), target);
  }
});

// --- reading a stored pound setup back ---

test('nothing stored for pounds falls back to the pound set, never the kg one', () => {
  assert.deepEqual(parseBarSetup(null, 'lb'), DEFAULT_LB_BAR_SETUP);
  assert.deepEqual(parseBarSetup('not json', 'lb'), DEFAULT_LB_BAR_SETUP);
  assert.deepEqual(parseBarSetup('{"barKg":0,"pairs":[]}', 'lb'), DEFAULT_LB_BAR_SETUP);
});

test('a stored pound setup comes back marked as pounds', () => {
  const s = parseBarSetup('{"unit":"lb","barKg":35,"pairs":[{"kg":45,"count":2}]}', 'lb');
  assert.deepEqual(s, { unit: 'lb', barKg: 35, pairs: [{ kg: 45, count: 2 }] });
});

test('a setup written before units existed still reads as kilograms', () => {
  const s = parseBarSetup('{"barKg":15,"pairs":[{"kg":20,"count":2}]}');
  assert.deepEqual(s, { barKg: 15, pairs: [{ kg: 20, count: 2 }] });
  assert.equal(setupUnit(s), 'kg');
});
