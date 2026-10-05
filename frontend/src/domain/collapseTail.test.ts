/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NO_TAIL,
  tailAfterCollapse,
  tailAfterRestore,
  tailAfterSettle,
  tailTotal,
  type ScrollMetrics,
} from './collapseTail.ts';

// A 600pt viewport over 1000pt of list, scrolled to the very end.
const atEnd: ScrollMetrics = { y: 400, viewport: 600, content: 1000 };

/** The list as it is laid out once a card has lost `lost` and the tail is `tail`. */
const after = (scroll: ScrollMetrics, lost: number, tailChange: number): ScrollMetrics => ({
  ...scroll,
  content: scroll.content - lost + tailChange,
});

test('a card collapsing at the end of the list is made up for in full', () => {
  const shares = tailAfterCollapse(NO_TAIL, 'a', atEnd, 200);
  assert.deepEqual(shares, { a: 200 });
  // The scroll position is still the end of the content: nothing jumps.
  const laid = after(atEnd, 200, tailTotal(shares));
  assert.equal(laid.content - laid.viewport, atEnd.y);
});

test('a card collapsing with room to spare below adds nothing', () => {
  const top: ScrollMetrics = { ...atEnd, y: 100 };
  assert.equal(tailAfterCollapse(NO_TAIL, 'a', top, 200), NO_TAIL);
});

test('only the part of the loss the scroll position needs is added', () => {
  const near: ScrollMetrics = { ...atEnd, y: 350 };
  assert.deepEqual(tailAfterCollapse(NO_TAIL, 'a', near, 200), { a: 150 });
});

test('a list shorter than the screen after the collapse still holds its place', () => {
  const short: ScrollMetrics = { y: 50, viewport: 600, content: 650 };
  assert.deepEqual(tailAfterCollapse(NO_TAIL, 'a', short, 300), { a: 50 });
});

test('a collapse that loses no height, or an overscrolled list, never adds more than was lost', () => {
  assert.equal(tailAfterCollapse(NO_TAIL, 'a', atEnd, 0), NO_TAIL);
  assert.equal(tailAfterCollapse(NO_TAIL, 'a', atEnd, -4), NO_TAIL);
  const bouncing: ScrollMetrics = { ...atEnd, y: 460 };
  assert.deepEqual(tailAfterCollapse(NO_TAIL, 'a', bouncing, 200), { a: 200 });
});

test('Undo gives back exactly what that card’s collapse added', () => {
  const one = tailAfterCollapse(NO_TAIL, 'a', atEnd, 200);
  assert.equal(tailTotal(tailAfterRestore(one, 'a')), 0);
  // With its 200pt back and its share gone, the list is as long as it was.
  const laid = after(after(atEnd, 200, 200), -200, -200);
  assert.equal(laid.content, atEnd.content);
});

test('Undo of one card leaves another card’s share alone', () => {
  let shares = tailAfterCollapse(NO_TAIL, 'a', atEnd, 200);
  shares = tailAfterCollapse(shares, 'b', after(atEnd, 200, 200), 120);
  assert.deepEqual(shares, { a: 200, b: 120 });
  assert.deepEqual(tailAfterRestore(shares, 'a'), { b: 120 });
  assert.deepEqual(tailAfterRestore(shares, 'b'), { a: 200 });
});

test('Undo of a card that added nothing changes nothing', () => {
  const shares = { a: 200 };
  assert.equal(tailAfterRestore(shares, 'b'), shares);
});

test('scrolling back up lets the tail go', () => {
  const shares = { a: 200 };
  // Content is 1000 again (800 of list, 200 of tail); scrolled up to 150.
  assert.equal(tailAfterSettle(shares, { y: 150, viewport: 600, content: 1000 }), NO_TAIL);
});

test('a settle part way keeps what still holds the list, shared out evenly', () => {
  const shares = { a: 200, b: 100 };
  // 1000 of content, 300 of it tail: the list proper ends at y = 100.
  const kept = tailAfterSettle(shares, { y: 250, viewport: 600, content: 1000 });
  assert.equal(tailTotal(kept), 150);
  assert.deepEqual(kept, { a: 100, b: 50 });
});

test('a settle never grows the tail, and leaves an untouched one as it is', () => {
  const shares = { a: 200 };
  assert.equal(tailAfterSettle(shares, { y: 400, viewport: 600, content: 1000 }), shares);
  assert.equal(tailAfterSettle(shares, { y: 460, viewport: 600, content: 1000 }), shares);
  assert.equal(tailAfterSettle(NO_TAIL, atEnd), NO_TAIL);
});
