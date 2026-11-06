/** Run with: npm test — OS locale tags to the app's two languages (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLang } from './locale.ts';

test('Simplified Chinese tags resolve to zh-Hans', () => {
  for (const tag of ['zh-SG', 'zh-CN', 'zh-Hans-CN', 'zh', 'zh-Hans', 'zh_CN', 'ZH-cn']) {
    assert.equal(resolveLang([tag]), 'zh-Hans', tag);
  }
});

test('Traditional Chinese tags resolve to English', () => {
  for (const tag of ['zh-Hant-TW', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO']) {
    assert.equal(resolveLang([tag]), 'en', tag);
  }
});

test('other languages and lookalike region codes resolve to English', () => {
  for (const tag of ['en', 'en-GR', 'en-US', 'el-GR', 'zhx', 'de']) {
    assert.equal(resolveLang([tag]), 'en', tag);
  }
});

test('only the first tag decides', () => {
  assert.equal(resolveLang(['en-US', 'zh-CN']), 'en');
  assert.equal(resolveLang(['zh-CN', 'en-US']), 'zh-Hans');
});

test('no tags resolve to English', () => {
  assert.equal(resolveLang([]), 'en');
});
