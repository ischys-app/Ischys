/** Run with: npm test — OS locale tags to the app's two languages (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_LANGS, effectiveLang, NATIVE_LANG_NAME, parseLangPref, resolveLang } from './locale.ts';

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

test('Russian tags resolve to ru; other Cyrillic-script languages stay English', () => {
  for (const tag of ['ru-RU', 'ru', 'ru-UA', 'ru-KZ', 'ru-Cyrl-RU']) {
    assert.equal(resolveLang([tag]), 'ru', tag);
  }
  for (const tag of ['uk-UA', 'be-BY', 'kk-KZ', 'ky', 'uz', 'ka', 'hy', 'az', 'ro-MD', 'sr-Cyrl']) {
    assert.equal(resolveLang([tag]), 'en', tag);
  }
  assert.equal(resolveLang(['uk-UA', 'ru-RU']), 'en');
});

test('parseLangPref: known languages pass, anything else is System', () => {
  for (const l of ['en', 'zh-Hans', 'ru'] as const) assert.equal(parseLangPref(l), l);
  for (const v of [null, undefined, '', 'system', 'uk', 'zh', 'RU', 'zh-hans']) assert.equal(parseLangPref(v), 'system', String(v));
});

test('effectiveLang: System applies the first-language rule; a choice overrides it', () => {
  assert.equal(effectiveLang('system', ['uk-UA', 'ru-RU']), 'en');
  assert.equal(effectiveLang('system', ['ru-RU']), 'ru');
  assert.equal(effectiveLang('ru', ['uk-UA', 'ru-RU']), 'ru');
  assert.equal(effectiveLang('en', ['zh-CN']), 'en');
  assert.equal(effectiveLang('zh-Hans', []), 'zh-Hans');
});

test('every offered language has a native name', () => {
  assert.deepEqual([...APP_LANGS], ['en', 'zh-Hans', 'ru']);
  for (const l of APP_LANGS) assert.ok(NATIVE_LANG_NAME[l].length > 0, l);
});
