/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createStartGuard, type RunningChoice, type RunningWorkout } from './startGuard.ts';

const world = (running: RunningWorkout | null, choice: RunningChoice = 'resume') => {
  const log = { started: 0, asked: [] as string[] };
  return {
    log,
    deps: {
      findRunning: async () => running,
      start: async () => {
        log.started += 1;
        return `new-${log.started}`;
      },
      ask: async (r: RunningWorkout) => {
        log.asked.push(r.name);
        return choice;
      },
    },
  };
};

test('with nothing running, the workout is started without a question', async () => {
  const { deps, log } = world(null);
  assert.deepEqual(await createStartGuard()(deps), { workoutId: 'new-1', resumed: false });
  assert.equal(log.started, 1);
  assert.deepEqual(log.asked, []);
});

test('with one running, nothing is started and the running one is offered', async () => {
  const { deps, log } = world({ id: 'push', name: 'Push' }, 'resume');
  assert.deepEqual(await createStartGuard()(deps), { workoutId: 'push', resumed: true });
  assert.equal(log.started, 0);
  assert.deepEqual(log.asked, ['Push']);
});

test('cancelling leaves the running workout alone and starts nothing', async () => {
  const { deps, log } = world({ id: 'push', name: 'Push' }, 'cancel');
  assert.equal(await createStartGuard()(deps), null);
  assert.equal(log.started, 0);
});

test('a second start while the first is being written does not start another', async () => {
  let release: (id: string) => void = () => {};
  let started = 0;
  const deps = {
    findRunning: async () => null,
    start: () => {
      started += 1;
      return new Promise<string>((resolve) => {
        release = resolve;
      });
    },
    ask: async (): Promise<RunningChoice> => 'resume',
  };
  const guard = createStartGuard();
  const first = guard(deps);
  // Let the first reach its write, then tap again.
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await guard(deps), null);
  release('only');
  assert.deepEqual(await first, { workoutId: 'only', resumed: false });
  assert.equal(started, 1);
});

test('the guard is free again after a start that failed', async () => {
  const guard = createStartGuard();
  const failing = { ...world(null).deps, start: async (): Promise<string> => Promise.reject(new Error('disk')) };
  await assert.rejects(guard(failing));
  const { deps } = world(null);
  assert.deepEqual(await guard(deps), { workoutId: 'new-1', resumed: false });
});
