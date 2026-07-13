/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { latestBefore, type PrevSession } from './previous.ts';

const s = (id: string, startedAt: number): PrevSession => ({ id, startedAt });

test('picks the most recent session before the cutoff', () => {
  const sessions = [s('a', 100), s('b', 200), s('c', 300)];
  assert.equal(latestBefore(sessions, 250)?.id, 'b');
});

test('strict inequality — a session exactly at `before` is excluded', () => {
  const sessions = [s('a', 100), s('b', 200)];
  assert.equal(latestBefore(sessions, 200)?.id, 'a');
});

test('returns null when none qualify', () => {
  const sessions = [s('a', 300), s('b', 400)];
  assert.equal(latestBefore(sessions, 200), null);
});

test('returns null for empty input', () => {
  assert.equal(latestBefore([], 200), null);
});

test('unordered input still returns the true latest', () => {
  const sessions = [s('c', 300), s('a', 100), s('d', 400), s('b', 200)];
  assert.equal(latestBefore(sessions, 350)?.id, 'c');
});
