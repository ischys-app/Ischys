/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { suggestNextSet } from './progression.ts';

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 29, 12);

const base = {
  equipment: 'barbell',
  kind: 'weighted' as const,
  setType: 'normal',
  last: { weight: 100, reps: 5 },
  lastSessionAt: NOW - 3 * DAY,
  targetReps: 5,
  step: 2.5,
  now: NOW,
};

const suggest = (over: Partial<typeof base> = {}) => suggestNextSet({ ...base, ...over });

// --- when it says nothing at all ---

test('says nothing for a warm-up or a drop set', () => {
  assert.equal(suggest({ setType: 'warmup' }), null);
  assert.equal(suggest({ setType: 'drop' }), null);
});

test('says nothing on the first session of an exercise', () => {
  assert.equal(suggest({ last: null, lastSessionAt: null }), null);
});

test('says nothing when the last session is too old to build on', () => {
  assert.equal(suggest({ lastSessionAt: NOW - 60 * DAY }), null);
  assert.ok(suggest({ lastSessionAt: NOW - 40 * DAY }) !== null);
});

test('says nothing when the last set was never completed', () => {
  assert.equal(suggest({ last: { weight: null, reps: null } }), null);
});

// --- going up ---

test('adds the step when the target was reached on a barbell', () => {
  const s = suggest();
  assert.equal(s?.kind, 'up');
  assert.equal(s?.weight, 102.5);
  assert.equal(s?.reps, 5);
});

test('the barbell step follows the plates the gym actually has', () => {
  assert.equal(suggest({ step: 5 })?.weight, 105);
});

test('a dumbbell moves in 2 kg, since the rack is unknown', () => {
  const s = suggest({ equipment: 'dumbbell', last: { weight: 20, reps: 8 }, targetReps: 8 });
  assert.equal(s?.weight, 22);
});

// --- in lb: the numbers are the user's, so the steps must be too (#80) ---

test('in lb a barbell goes up a whole 5, not a converted 2.5 kg', () => {
  const s = suggest({ last: { weight: 225, reps: 5 }, step: 5 });
  assert.equal(s?.weight, 230);
});

test('in lb a dumbbell moves to the next 5 when told the rack is in pounds', () => {
  const s = suggestNextSet({
    ...base,
    equipment: 'dumbbell',
    last: { weight: 45, reps: 8 },
    targetReps: 8,
    step: 5,
    dumbbellStep: 5,
  });
  assert.equal(s?.weight, 50);
});

test('a kg-era weight read in lb lands on a loadable lb number', () => {
  // 100 kg shows as 220.46 lb; the suggestion snaps to the 5 lb grid.
  const s = suggest({ last: { weight: 220.46, reps: 5 }, step: 5 });
  assert.equal(s?.weight, 225);
});

test('a machine adds a rep rather than guessing a stack step', () => {
  const s = suggest({ equipment: 'machine', last: { weight: 40, reps: 10 }, targetReps: 10 });
  assert.equal(s?.kind, 'up');
  assert.equal(s?.weight, 40, 'weight must not move on a stack we cannot read');
  assert.equal(s?.reps, 11);
});

test('a cable behaves like a machine', () => {
  const s = suggest({ equipment: 'cable', last: { weight: 30, reps: 12 }, targetReps: 12 });
  assert.equal(s?.weight, 30);
  assert.equal(s?.reps, 13);
});

test('bodyweight adds a rep', () => {
  const s = suggest({ equipment: 'bodyweight', kind: 'bodyweight', last: { weight: 0, reps: 10 }, targetReps: 10 });
  assert.equal(s?.reps, 11);
});

// --- holding ---

test('a missed target holds the weight and asks for one more rep', () => {
  const s = suggest({ last: { weight: 100, reps: 3 }, targetReps: 5 });
  assert.equal(s?.kind, 'hold');
  assert.equal(s?.weight, 100);
  assert.equal(s?.reps, 4);
});

test('the extra rep never overshoots the target', () => {
  const s = suggest({ last: { weight: 100, reps: 4 }, targetReps: 5 });
  assert.equal(s?.reps, 5);
});

test('it never suggests going down on its own', () => {
  for (const reps of [1, 2, 3, 4]) {
    const s = suggest({ last: { weight: 100, reps }, targetReps: 8 });
    assert.equal(s?.kind, 'hold');
    assert.ok((s?.weight ?? 0) >= 100, 'weight must not drop without a deload');
  }
});

// --- deload ---

test('only a deload sends it downward', () => {
  const s = suggest({ deloadActive: true });
  assert.equal(s?.kind, 'down');
  assert.equal(s?.weight, 90);
});

test('a deload rounds to something loadable', () => {
  const s = suggest({ deloadActive: true, last: { weight: 102.5, reps: 5 }, step: 2.5 });
  assert.equal((s?.weight ?? 0) % 2.5, 0);
});

// --- no routine to compare against ---

test('without a target it compares against what was done last time', () => {
  // No routine: matching last session's reps counts as reaching it.
  const s = suggest({ targetReps: null, last: { weight: 100, reps: 6 } });
  assert.equal(s?.kind, 'up');
  assert.equal(s?.weight, 102.5);
});
