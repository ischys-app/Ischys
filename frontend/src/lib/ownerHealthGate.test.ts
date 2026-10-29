/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptsWatchMessage, createInFlight } from './ownerHealthGate.ts';

test('a Watch message is taken in for the owner, or while an owner finish is pending', () => {
  assert.equal(acceptsWatchMessage(true, false), true);
  assert.equal(acceptsWatchMessage(true, true), true);
  assert.equal(acceptsWatchMessage(false, true), true);
  assert.equal(acceptsWatchMessage(false, false), false);
});

test('a job is pending for exactly as long as it runs', async () => {
  const inFlight = createInFlight();
  assert.equal(inFlight.pending(), false);
  let release!: () => void;
  const job = inFlight.run(() => new Promise<void>((r) => (release = r)));
  assert.equal(inFlight.pending(), true);
  release();
  await job;
  assert.equal(inFlight.pending(), false);
});

test('two overlapping jobs keep it pending until both end', async () => {
  const inFlight = createInFlight();
  let a!: () => void;
  let b!: () => void;
  const ja = inFlight.run(() => new Promise<void>((r) => (a = r)));
  const jb = inFlight.run(() => new Promise<void>((r) => (b = r)));
  a();
  await ja;
  assert.equal(inFlight.pending(), true);
  b();
  await jb;
  assert.equal(inFlight.pending(), false);
});

test('a job that throws still ends', async () => {
  const inFlight = createInFlight();
  await assert.rejects(inFlight.run(() => Promise.reject(new Error('Health'))));
  assert.equal(inFlight.pending(), false);
});
