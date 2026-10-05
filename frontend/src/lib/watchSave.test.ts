/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createWatchSaveLog } from './watchSave.ts';

/** A log on a clock the test moves by hand. */
function logAt(start: number) {
  const clock = { now: start };
  return { clock, log: createWatchSaveLog(() => clock.now) };
}

test('a confirmation that landed since the finish began counts at once', async () => {
  const { clock, log } = logAt(1_000);
  clock.now = 1_200;
  log.note({ action: 'workoutSaved', uuid: 'u1' });
  assert.equal(await log.wait(1_000, 5), true);
  assert.equal(log.uuid, 'u1');
});

test('a confirmation from before the finish began does not count', async () => {
  // The last workout's, still on record when the next one finishes.
  const { clock, log } = logAt(1_000);
  log.note({ action: 'workoutSaved', uuid: 'old' });
  clock.now = 60_000;
  assert.equal(await log.wait(60_000, 5), false);
});

test('a confirmation arriving during the wait ends it', async () => {
  const { clock, log } = logAt(1_000);
  const waiting = log.wait(1_000, 5_000);
  clock.now = 1_500;
  log.note({ action: 'workoutSaved', uuid: 'u1' });
  assert.equal(await waiting, true);
});

test('no confirmation in time resolves false', async () => {
  const { log } = logAt(1_000);
  assert.equal(await log.wait(1_000, 5), false);
});

test('only workoutSaved is a confirmation', async () => {
  const { log } = logAt(1_000);
  log.note({ action: 'end' });
  log.note({ action: 'logSet' });
  assert.equal(await log.wait(1_000, 5), false);
});

test('a confirmation without a usable uuid still confirms, with no uuid', async () => {
  // A Watch build from before the uuid was sent.
  const { log } = logAt(1_000);
  log.note({ action: 'workoutSaved' });
  assert.equal(await log.wait(1_000, 5), true);
  assert.equal(log.uuid, null);
  log.note({ action: 'workoutSaved', uuid: '' });
  assert.equal(log.uuid, null);
});

test('a confirmation buffered before JS was listening counts for the finish drained with it', async () => {
  // Cold launch: the Watch's finish request and its "saved" both arrived
  // before anything subscribed. Whichever order they were buffered in, the
  // finish applied from that drain must find the confirmation.
  for (const actions of [
    [{ action: 'end' }, { action: 'workoutSaved', uuid: 'u1' }],
    [{ action: 'workoutSaved', uuid: 'u1' }, { action: 'end' }],
  ]) {
    const { clock, log } = logAt(5_000);
    const heardAt = log.noteDrained(actions, 5_000);
    // The finish itself begins later, once the active workout has been read.
    clock.now = 5_400;
    assert.equal(await log.wait(heardAt, 5), true);
    assert.equal(log.uuid, 'u1');
  }
});

test('a stale buffered confirmation does not count for a later finish', async () => {
  // Drained at launch with no finish beside it: it belongs to a workout that
  // is already over. The next workout's finish must not take it as its own.
  const { clock, log } = logAt(5_000);
  log.noteDrained([{ action: 'workoutSaved', uuid: 'old' }], 5_000);
  clock.now = 3_600_000;
  assert.equal(await log.wait(3_600_000, 5), false);
});

test('a drain with no confirmation in it records none', async () => {
  const { log } = logAt(5_000);
  const heardAt = log.noteDrained([{ action: 'end' }], 5_000);
  assert.equal(heardAt, 5_000);
  assert.equal(await log.wait(heardAt, 5), false);
});

test('an older confirmation does not replace a newer one', async () => {
  // A live confirmation can land between the native drain and its result
  // being recorded. The buffered one is older and must not take its place.
  const { clock, log } = logAt(5_000);
  clock.now = 5_100;
  log.note({ action: 'workoutSaved', uuid: 'live' });
  log.noteDrained([{ action: 'workoutSaved', uuid: 'buffered' }], 5_000);
  assert.equal(log.uuid, 'live');
  assert.equal(await log.wait(5_050, 5), true);
});
