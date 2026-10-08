/**
 * The wire contract with the Wear OS companion, from the phone's side.
 *
 * The fixtures beside this file are what the Watch's own tests decode and
 * encode (wear/app/src/test/.../WireTest.kt). This checks that they are still
 * what the phone really sends and accepts, so the two halves are tested
 * against the same bytes without a paired Watch.
 *
 * Run with: node --test modules/wear-link/protocol.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { completesWorkout, finishRequestId, finishVerdict, withFinishVerdict } from '../../src/lib/watchFinish.ts';
import { buildFinishedWatchState, buildWatchState } from '../../src/lib/watchState.ts';
import { exercises, resolve, REST_ENDS_AT, STARTED_AT } from './fixtures/inputs.ts';
import { parseAction } from './parseAction.ts';

const dir = path.join(import.meta.dirname, 'fixtures');
const read = (name: string) => fs.readFileSync(path.join(dir, name), 'utf8');
const fixture = (name: string): Record<string, unknown> => JSON.parse(read(name));

/** As `pushWatchState` sends it: the accent rides along, then JSON text and back. */
const sent = (state: Record<string, unknown> | null, themeId = 'ember') =>
  JSON.parse(JSON.stringify({ themeId, ...state }));

const session = () =>
  buildWatchState(
    exercises(1),
    'Push Day',
    { resting: false, remaining: 0, total: 0, alerts: true },
    resolve,
    STARTED_AT,
    80,
    false,
    'kg',
  );

test('the session fixture is what buildWatchState pushes', () => {
  assert.deepEqual(sent(session()), fixture('state-session.json'));
});

test('the resting fixture is what buildWatchState pushes mid-rest', () => {
  const resting = buildWatchState(
    exercises(2),
    'Push Day',
    { resting: true, remaining: 90, total: 120, endsAt: REST_ENDS_AT, alerts: true },
    resolve,
    STARTED_AT,
    80,
    false,
    'lb',
  );
  assert.deepEqual(sent(resting, 'volt'), fixture('state-resting.json'));
});

test('the all-sets-done fixture is what buildFinishedWatchState pushes', () => {
  const finished = buildFinishedWatchState(exercises(5), 'Push Day', STARTED_AT, 80, false, 'kg', true);
  assert.deepEqual(sent(finished), fixture('state-finished.json'));
});

test('the verdict fixtures are what the finish handshake pushes', () => {
  assert.deepEqual(sent(finishVerdict('failed', 'finish-1')), fixture('verdict-only.json'));
  assert.deepEqual(
    sent(withFinishVerdict(session(), 'finished', 'finish-2')),
    fixture('verdict-with-state.json'),
  );
});

test('the start fixture has the shape the root layout pushes', () => {
  const start = fixture('state-start.json');
  assert.equal(start.screen, 'start');
  for (const routine of start.routines as Record<string, unknown>[]) {
    assert.deepEqual(Object.keys(routine).sort(), ['exerciseCount', 'id', 'initials', 'name']);
  }
});

test('every action the Watch sends parses into a WatchAction the phone knows', () => {
  const actions = (JSON.parse(read('actions.json')) as unknown[]).map((a) =>
    parseAction(JSON.stringify(a)),
  );
  assert.ok(actions.every((a) => a !== null));
  const names = actions.map((a) => a!.action);
  assert.deepEqual(names, [
    'logSet',
    'adjustRest',
    'skipRest',
    'end',
    'end',
    'discard',
    'addSet',
    'startEmpty',
    'startRoutine',
    'requestState',
    'sessionMetrics',
  ]);

  const [logSet, adjustRest, , end, endAsking, discard, , , startRoutine] = actions as Record<
    string,
    unknown
  >[];
  // The workout screen reads these as strings and a unit, and converts.
  assert.equal(typeof logSet.weight, 'string');
  assert.equal(typeof logSet.reps, 'string');
  assert.ok(logSet.unit === 'kg' || logSet.unit === 'lb');
  assert.equal(typeof adjustRest.seconds, 'number');
  assert.equal(typeof startRoutine.routineId, 'string');
  // A plain finish is not waiting for an answer; one with an id is.
  assert.equal(finishRequestId(end as { action: string }), null);
  assert.equal(finishRequestId(endAsking as { action: string }), 'finish-1');
  assert.ok(completesWorkout(String(end.action)) && completesWorkout(String(discard.action)));
});

test('a malformed action is dropped, not passed on', () => {
  assert.equal(parseAction('not json'), null);
  assert.equal(parseAction('[1,2]'), null);
  assert.equal(parseAction('{"weight":"100"}'), null);
  assert.equal(parseAction(undefined), null);
});
