/** Run with: npm test */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  createWearSessionLog,
  parseWearSession,
  withWearSession,
  workoutForSession,
  type WearSession,
} from './wearSession.ts';

const MIN = 60_000;
const T0 = 1_760_000_000_000;

const session = (over: Partial<WearSession> = {}): WearSession => ({
  startedAt: T0,
  endedAt: T0 + 60 * MIN,
  avgHr: 121,
  maxHr: 164,
  energyKcal: 312,
  ...over,
});

test('the action the Watch really sends parses', () => {
  // The same fixture the Watch's own tests encode against.
  const actions = JSON.parse(
    readFileSync(new URL('../../modules/wear-link/fixtures/actions.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>[];
  const sent = actions.find((a) => a.action === 'sessionMetrics');
  assert.ok(sent);
  assert.deepEqual(parseWearSession(sent), {
    startedAt: sent.startedAt,
    endedAt: sent.endedAt,
    avgHr: sent.avgHr,
    maxHr: sent.maxHr,
    energyKcal: sent.cal,
  });
});

test('other actions are not sessions', () => {
  assert.equal(parseWearSession({ action: 'end' }), null);
  assert.equal(parseWearSession({ action: 'workoutSaved', uuid: 'u' }), null);
});

test('a heart rate the Watch never read is no heart rate, and the energy still counts', () => {
  const s = parseWearSession({
    action: 'sessionMetrics',
    startedAt: T0,
    endedAt: T0 + MIN,
    avgHr: 0,
    maxHr: 0,
    cal: 40,
  });
  assert.deepEqual(s, { startedAt: T0, endedAt: T0 + MIN, avgHr: null, maxHr: null, energyKcal: 40 });
});

test('an unbelievable heart rate drops both numbers, not one', () => {
  const base = { action: 'sessionMetrics', startedAt: T0, endedAt: T0 + MIN, cal: 0 };
  for (const [avgHr, maxHr] of [
    [130, 120], // average above the maximum
    [120, 300],
    [10, 120],
  ]) {
    const s = parseWearSession({ ...base, avgHr, maxHr });
    assert.equal(s?.avgHr, null);
    assert.equal(s?.maxHr, null);
    assert.equal(s?.energyKcal, null);
  }
});

test('a session with no believable times is dropped', () => {
  const base = { action: 'sessionMetrics', avgHr: 120, maxHr: 150, cal: 10 };
  assert.equal(parseWearSession({ ...base, startedAt: T0, endedAt: T0 }), null);
  assert.equal(parseWearSession({ ...base, startedAt: 0, endedAt: T0 }), null);
  assert.equal(parseWearSession({ ...base, startedAt: 'x', endedAt: T0 }), null);
});

test('a session belongs to the workout it ran alongside', () => {
  const workouts = [
    { id: 'today', startedAt: T0 - 5_000, endedAt: T0 + 61 * MIN },
    { id: 'yesterday', startedAt: T0 - 24 * 60 * MIN, endedAt: T0 - 23 * 60 * MIN },
  ];
  assert.equal(workoutForSession(session(), workouts, T0 + 62 * MIN), 'today');
});

test('a workout still running counts up to now', () => {
  // The Watch ended on its own and its numbers arrive before the finish.
  const workouts = [{ id: 'active', startedAt: T0 - 5_000, endedAt: null }];
  assert.equal(workoutForSession(session(), workouts, T0 + 60 * MIN + 500), 'active');
});

test('a session that overlaps no workout belongs to none', () => {
  const workouts = [{ id: 'later', startedAt: T0 + 120 * MIN, endedAt: T0 + 180 * MIN }];
  assert.equal(workoutForSession(session(), workouts, T0 + 200 * MIN), null);
});

test('a session left running long after its workout is not handed to the next one', () => {
  // Three hours of session; the next workout began in its last ten minutes.
  const long = session({ endedAt: T0 + 180 * MIN });
  const workouts = [{ id: 'next', startedAt: T0 + 170 * MIN, endedAt: null }];
  assert.equal(workoutForSession(long, workouts, T0 + 180 * MIN), null);
});

test('of two workouts it touches, the one it mostly ran with wins', () => {
  const workouts = [
    { id: 'brief', startedAt: T0 - 10 * MIN, endedAt: T0 + 2 * MIN },
    { id: 'main', startedAt: T0 + 3 * MIN, endedAt: T0 + 60 * MIN },
  ];
  assert.equal(workoutForSession(session(), workouts, T0 + 61 * MIN), 'main');
});

test('a finish finds a session that already arrived', async () => {
  const log = createWearSessionLog();
  log.note(session());
  assert.deepEqual(await log.wait(T0 - 1_000, T0 + 61 * MIN, 5), session());
});

test('a finish is woken by the session arriving', async () => {
  const log = createWearSessionLog();
  const waiting = log.wait(T0 - 1_000, T0 + 61 * MIN, 5_000);
  log.note(session());
  assert.deepEqual(await waiting, session());
});

test('a finish gives up when nothing arrives', async () => {
  const log = createWearSessionLog();
  assert.equal(await log.wait(T0, T0 + MIN, 5), null);
});

test("the last workout's session is not this one's", async () => {
  const log = createWearSessionLog();
  log.note(session({ startedAt: T0 - 24 * 60 * MIN, endedAt: T0 - 23 * 60 * MIN }));
  assert.equal(await log.wait(T0, T0 + 60 * MIN, 5), null);
});

test("an arrival that is not this workout's does not end the wait", async () => {
  const log = createWearSessionLog();
  const waiting = log.wait(T0, T0 + 60 * MIN, 5_000);
  log.note(session({ startedAt: T0 - 24 * 60 * MIN, endedAt: T0 - 23 * 60 * MIN }));
  log.note(session());
  assert.deepEqual(await waiting, session());
});

test("the Watch's numbers take the place of the health store's", () => {
  const read = { avgHr: 99, maxHr: 140, energyKcal: 250 };
  assert.deepEqual(withWearSession(read, session()), { avgHr: 121, maxHr: 164, energyKcal: 312 });
});

test('what the Watch did not measure is left as the health store had it', () => {
  const read = { avgHr: 99, maxHr: 140, energyKcal: 250 };
  const blind = session({ avgHr: null, maxHr: null, energyKcal: null });
  assert.deepEqual(withWearSession(read, blind), read);
  assert.deepEqual(withWearSession(read, null), read);
});
