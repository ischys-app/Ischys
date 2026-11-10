import assert from 'node:assert/strict';
import { test } from 'node:test';

import { allowsTwoLineNames, nameNeedsSystemFont, usesSystemFont } from './scripts.ts';
import type { Lang } from './locale.ts';

const LANGS: Lang[] = ['en', 'es', 'el', 'ru', 'zh-Hans'];

test('usesSystemFont is true for ru and el only', () => {
  for (const l of LANGS) assert.equal(usesSystemFont(l), l === 'ru' || l === 'el', l);
});

test('allowsTwoLineNames is true for ru, el and es', () => {
  for (const l of LANGS) assert.equal(allowsTwoLineNames(l), l === 'ru' || l === 'el' || l === 'es', l);
});

test('nameNeedsSystemFont covers el, ru, zh-Hans unless it is the UI language', () => {
  for (const id of LANGS) {
    for (const ui of LANGS) {
      const expected = (id === 'el' || id === 'ru' || id === 'zh-Hans') && id !== ui;
      assert.equal(nameNeedsSystemFont(id, ui), expected, `${id} in ${ui}`);
    }
  }
  assert.equal(nameNeedsSystemFont('es', 'el'), false);
  assert.equal(nameNeedsSystemFont('el', 'en'), true);
});
