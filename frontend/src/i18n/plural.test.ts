/** Run with: npm test — Russian plural categories. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ruPlural } from './plural.ts';

test('ruPlural picks one / few / many / other', () => {
  for (const n of [1, 21, 101, -1]) assert.equal(ruPlural(n), 'one', String(n));
  for (const n of [2, 3, 4, 22, 24, 102]) assert.equal(ruPlural(n), 'few', String(n));
  for (const n of [0, 5, 11, 12, 14, 25, 111, 112]) assert.equal(ruPlural(n), 'many', String(n));
  for (const n of [1.5, 2.5]) assert.equal(ruPlural(n), 'other', String(n));
});
