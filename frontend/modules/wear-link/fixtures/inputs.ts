/**
 * The workout the shared protocol fixtures are built from. `protocol.test.ts`
 * rebuilds each fixture from this with the real builders and compares, so a
 * change to the state the phone pushes fails here until the fixtures — which
 * the Watch's own tests decode — are regenerated and the Watch is checked
 * against them.
 */
export const STARTED_AT = 1_760_000_000_000;
export const REST_ENDS_AT = 1_760_000_900_000;

type FixtureSet = {
  id: string;
  type: string;
  weight: string;
  reps: string;
  prevWeight?: string;
  prevReps?: string;
  done: boolean;
};

const set = (id: string, done: boolean, weight: string, reps: string, type = 'normal'): FixtureSet => ({
  id,
  type,
  weight,
  reps,
  prevWeight: '97.5',
  prevReps: '8',
  done,
});

/** Two exercises, five sets; the first `done` of them logged. */
export function exercises(done: number) {
  let n = 0;
  const next = (weight: string, reps: string, type?: string) => {
    n += 1;
    return set(`s${n}`, n <= done, weight, reps, type);
  };
  return [
    {
      id: 'e1',
      name: 'Bench Press',
      equipment: 'Barbell',
      rest: 120,
      kind: 'weighted' as const,
      supersetGroup: null,
      sets: [next('60', '10', 'warmup'), next('100', '8'), next('102.5', '6')],
    },
    {
      id: 'e2',
      name: 'Pull-up',
      equipment: 'Bodyweight',
      rest: 90,
      kind: 'bodyweight' as const,
      supersetGroup: null,
      sets: [next('10', '8'), next('10', '7')],
    },
  ];
}

/** The carry-forward rule is injected in the app; the fixtures use the set as typed. */
export const resolve = (sets: readonly { weight: string; reps: string }[], index: number) => ({
  weight: sets[index].weight,
  reps: sets[index].reps,
});
