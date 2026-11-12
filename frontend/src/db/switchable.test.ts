/** Run with: npm test — the facade that lets `db` point at another profile's connection. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSwitchable } from './switchable.ts';

test('forwards property reads and calls to the current target', () => {
  const a = { name: 'a', who() { return this.name; } };
  const b = { name: 'b', who() { return this.name; } };
  const s = createSwitchable(a);
  assert.equal(s.handle.who(), 'a');
  s.swap(b);
  assert.equal(s.handle.who(), 'b');
  assert.equal(s.handle.name, 'b');
  assert.equal(s.current(), b);
});

test('a method read before the swap still runs on the target it was read from', () => {
  const a = { name: 'a', who() { return this.name; } };
  const s = createSwitchable(a);
  const who = s.handle.who;
  s.swap({ name: 'b', who() { return this.name; } });
  assert.equal(who(), 'a');
});

test('class checks see the current target, not a bound copy of its class', () => {
  class A { tag = 'a'; }
  class B { tag = 'b'; }
  const s = createSwitchable<object>(new A());
  assert.ok(s.handle instanceof A);
  assert.equal(s.handle.constructor, A);
  s.swap(new B());
  assert.ok(s.handle instanceof B);
  assert.equal(Object.getPrototypeOf(s.handle).constructor, B);
});
