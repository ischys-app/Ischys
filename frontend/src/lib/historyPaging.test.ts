/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appendPage, hasMorePages, HISTORY_PAGE_SIZE, refreshLimit } from './historyPaging.ts';

const rows = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `w${from + i}` }));

test('paging reaches every workout, however many there are', () => {
  // The owner's history, and one far past it: the old read stopped at 100.
  for (const total of [0, 1, 49, 50, 51, 100, 101, 270, 5000]) {
    const all = rows(0, total);
    let loaded: { id: string }[] = [];
    let reads = 0;
    do {
      loaded = appendPage(loaded, all.slice(loaded.length, loaded.length + HISTORY_PAGE_SIZE));
      reads += 1;
    } while (hasMorePages(loaded.length, total));
    assert.deepEqual(loaded, all, `total ${total}`);
    assert.equal(reads, Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)), `reads for ${total}`);
  }
});

test('a row the previous page already gave is not listed twice', () => {
  // A workout was finished between two reads, shifting every offset by one.
  const first = rows(0, 50);
  const second = [{ id: 'w49' }, ...rows(50, 49)];
  const merged = appendPage(first, second);
  assert.equal(merged.length, 99);
  assert.equal(new Set(merged.map((w) => w.id)).size, 99);
  assert.equal(merged[49].id, 'w49');
  assert.equal(merged[50].id, 'w50');
});

test('nothing more to read once the count is reached', () => {
  assert.equal(hasMorePages(0, 0), false);
  assert.equal(hasMorePages(50, 270), true);
  assert.equal(hasMorePages(270, 270), false);
  // One deleted elsewhere since the count was taken.
  assert.equal(hasMorePages(270, 269), false);
});

test('coming back re-reads as much as was showing, in whole pages', () => {
  assert.equal(refreshLimit(0), 50);
  assert.equal(refreshLimit(50), 50);
  assert.equal(refreshLimit(51), 100);
  assert.equal(refreshLimit(270), 300);
});
