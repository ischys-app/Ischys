/**
 * Run with: npm test — work held back until the app is in the foreground.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAlertWhenActive, createWhenActive, type AppStateSource } from './activeGate.ts';

function fakeAppState(initial: string | null) {
  let state = initial;
  const listeners = new Set<(s: string) => void>();
  const source: AppStateSource = {
    current: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    listenerCount: () => listeners.size,
    go(next: string) {
      state = next;
      for (const l of [...listeners]) l(next);
    },
  };
}

test('runs at once when the app is active', () => {
  const app = fakeAppState('active');
  const whenActive = createWhenActive(app.source);
  let ran = 0;
  whenActive(() => ran++);
  assert.equal(ran, 1);
  assert.equal(app.listenerCount(), 0);
});

test('waits in the background until the app is active, then runs once', () => {
  const app = fakeAppState('background');
  const whenActive = createWhenActive(app.source);
  let ran = 0;
  whenActive(() => ran++);
  assert.equal(ran, 0);
  app.go('inactive'); // unlocking passes through inactive
  assert.equal(ran, 0);
  app.go('active');
  assert.equal(ran, 1);
  app.go('background');
  app.go('active');
  assert.equal(ran, 1, 'runs on the first return only');
  assert.equal(app.listenerCount(), 0, 'stops listening');
});

test('an unknown state waits too', () => {
  const app = fakeAppState(null);
  const whenActive = createWhenActive(app.source);
  let ran = 0;
  whenActive(() => ran++);
  assert.equal(ran, 0);
  app.go('active');
  assert.equal(ran, 1);
});

test('a source that reports active while subscribing runs once and unsubscribes', () => {
  const listeners = new Set<(s: string) => void>();
  const source: AppStateSource = {
    current: () => 'background',
    subscribe(listener) {
      listeners.add(listener);
      listener('active');
      return () => listeners.delete(listener);
    },
  };
  let ran = 0;
  createWhenActive(source)(() => ran++);
  assert.equal(ran, 1);
  assert.equal(listeners.size, 0);
});

test('cancelled before the app is active, it never runs and stops listening', () => {
  const app = fakeAppState('background');
  const whenActive = createWhenActive(app.source);
  let ran = 0;
  const cancel = whenActive(() => ran++);
  assert.equal(app.listenerCount(), 1);
  cancel();
  assert.equal(app.listenerCount(), 0);
  app.go('active');
  assert.equal(ran, 0);
  cancel(); // twice is harmless
});

test('cancelling after it ran changes nothing', () => {
  const app = fakeAppState('active');
  let ran = 0;
  const cancel = createWhenActive(app.source)(() => ran++);
  cancel();
  assert.equal(ran, 1);
});

test('alerts asked for in the background show when the app is active', () => {
  const app = fakeAppState('background');
  const shown: string[] = [];
  const alert = createAlertWhenActive(createWhenActive(app.source), (title, message) =>
    shown.push(`${title}: ${message}`),
  );
  alert('Couldn’t finish workout', 'Try again.');
  assert.deepEqual(shown, []);
  app.go('active');
  assert.deepEqual(shown, ['Couldn’t finish workout: Try again.']);
});

test('the same alert asked for twice while waiting shows once', () => {
  const app = fakeAppState('background');
  const shown: string[] = [];
  const alert = createAlertWhenActive(createWhenActive(app.source), (title) => shown.push(title));
  alert('A', 'x');
  alert('A', 'x');
  alert('B', 'x');
  app.go('active');
  assert.deepEqual(shown, ['A', 'B']);
  // Shown and gone: asking again shows it again.
  alert('A', 'x');
  assert.deepEqual(shown, ['A', 'B', 'A']);
});

test('in the foreground every alert shows, with its buttons passed through', () => {
  const app = fakeAppState('active');
  const shown: unknown[][] = [];
  const alert = createAlertWhenActive(createWhenActive(app.source), (...args: unknown[]) => shown.push(args));
  const buttons = [{ text: 'OK' }];
  alert('A', 'x', buttons);
  alert('A', 'x', buttons);
  assert.deepEqual(shown, [
    ['A', 'x', buttons],
    ['A', 'x', buttons],
  ]);
});
