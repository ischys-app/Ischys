/** Run with: npm test — the bound translator follows the current language (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getLang, setLang } from './current.ts';
import { isZh, t } from './t.ts';

test('defaults to English; unknown keys return the key', () => {
  assert.equal(getLang(), 'en');
  assert.equal(isZh(), false);
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('isZh follows setLang', () => {
  setLang('zh-Hans');
  assert.equal(isZh(), true);
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('en');
  assert.equal(isZh(), false);
});
