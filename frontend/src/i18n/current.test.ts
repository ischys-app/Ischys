/** Run with: npm test — language change notifications (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getLang, onLangChange, setLang } from './current.ts';

test('onLangChange fires once per real change, not for the same language', () => {
  setLang('en');
  const seen: string[] = [];
  const off = onLangChange((l) => seen.push(l));
  setLang('ru');
  setLang('ru');
  setLang('zh-Hans');
  off();
  setLang('en');
  assert.deepEqual(seen, ['ru', 'zh-Hans']);
  assert.equal(getLang(), 'en');
});
