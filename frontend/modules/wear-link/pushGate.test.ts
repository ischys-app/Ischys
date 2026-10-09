/** Run with: npm test */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createPushGate } from './pushGate.ts';

const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >;

const resting = fixture('state-resting');
const session = fixture('state-session');

test('the fixture is a rest the Watch can count down itself', () => {
  assert.equal(resting.resting, true);
  assert.ok((resting.restEndsAt as number) > 0);
});

test('a rest is sent once, not once a second', () => {
  const shouldSend = createPushGate();
  const start = resting.restRemaining as number;
  const sent = [];
  for (let left = start; left > start - 30; left--) {
    sent.push(shouldSend({ ...resting, restRemaining: left }));
  }
  assert.deepEqual(sent, [true, ...Array(29).fill(false)]);
});

test('anything else changing during a rest is sent', () => {
  const shouldSend = createPushGate();
  shouldSend({ ...resting, restRemaining: 90 });
  // +15 on the phone: a new end date.
  assert.equal(
    shouldSend({ ...resting, restRemaining: 104, restEndsAt: (resting.restEndsAt as number) + 15_000 }),
    true,
  );
  assert.equal(shouldSend({ ...resting, restRemaining: 103, weight: '102.5' }), true);
});

test('the rest ending is sent', () => {
  const shouldSend = createPushGate();
  shouldSend({ ...resting, restRemaining: 1 });
  assert.equal(shouldSend({ ...resting, resting: false, restRemaining: 0, restEndsAt: 0 }), true);
});

test('the same state again is the answer to a Watch that asked, and is sent', () => {
  const shouldSend = createPushGate();
  assert.equal(shouldSend(session), true);
  assert.equal(shouldSend({ ...session }), true);
  // Also in the middle of a rest, after ticks that were skipped.
  shouldSend({ ...resting, restRemaining: 60 });
  assert.equal(shouldSend({ ...resting, restRemaining: 59 }), false);
  assert.equal(shouldSend({ ...resting, restRemaining: 59 }), true);
});

test('a countdown with no end date is all the Watch has, so every second is sent', () => {
  const shouldSend = createPushGate();
  const blind = { ...resting, restEndsAt: 0 };
  assert.equal(shouldSend({ ...blind, restRemaining: 60 }), true);
  assert.equal(shouldSend({ ...blind, restRemaining: 59 }), true);
});

test('a verdict or a start screen is never mistaken for a tick', () => {
  const shouldSend = createPushGate();
  shouldSend({ ...resting, restRemaining: 60 });
  assert.equal(shouldSend({ finishVerdict: 'finished', finishId: 'f1' }), true);
  assert.equal(shouldSend({ screen: 'start', routines: [] }), true);
});
