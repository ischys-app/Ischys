/** Run with: npm test — the bound translator follows the current language (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getLang, setLang } from './current.ts';
import { t } from './t.ts';

test('defaults to English; unknown keys return the key', () => {
  assert.equal(getLang(), 'en');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('unknown keys return the key in zh too', () => {
  setLang('zh-Hans');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('en');
});

test('import button reads as one phrase in both languages', () => {
  const label = () =>
    t('import.importCount', {
      count: 2,
      into: t('import.into', { name: 'Tom' }),
      unit: t('import.asUnit', { unit: 'KG' }),
    });
  assert.equal(label(), 'Import 2 workouts into Tom as KG');
  setLang('zh-Hans');
  try {
    assert.equal(label(), '导入 2 次训练到 Tom（KG）');
  } finally {
    setLang('en');
  }
});
