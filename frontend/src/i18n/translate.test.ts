/** Run with: npm test — translator lookup, fallback, interpolation, plurals (#136). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createTranslator } from './translate.ts';

const en = {
  hello: { en: 'Hello', note: 'greeting' },
  greet: { en: 'Hi {name}', note: 'greeting with name' },
  sets_one: { en: '{count} set', note: 'plural one' },
  sets_other: { en: '{count} sets', note: 'plural other' },
  onlyEn: { en: 'Only English', note: 'no zh' },
};

test('zh present: zh is used', () => {
  const t = createTranslator('zh-Hans', { hello: '你好' }, en);
  assert.equal(t('hello'), '你好');
});

test('zh missing: falls back to English', () => {
  const t = createTranslator('zh-Hans', { hello: '你好' }, en);
  assert.equal(t('onlyEn'), 'Only English');
});

test('en language ignores zh', () => {
  const t = createTranslator('en', { hello: '你好' }, en);
  assert.equal(t('hello'), 'Hello');
});

test('key missing everywhere: returns the key and does not throw', () => {
  const t = createTranslator('zh-Hans', {}, en);
  assert.equal(t('nope.nothing'), 'nope.nothing');
});

test('interpolates {name}', () => {
  const t = createTranslator('zh-Hans', { greet: '你好，{name}' }, en);
  assert.equal(t('greet', { name: 'Ada' }), '你好，Ada');
  assert.equal(createTranslator('en', {}, en)('greet', { name: 'Ada' }), 'Hi Ada');
});

test('count picks _one / _other in English', () => {
  const t = createTranslator('en', {}, en);
  assert.equal(t('sets', { count: 1 }), '1 set');
  assert.equal(t('sets', { count: 3 }), '3 sets');
  assert.equal(t('sets', { count: 0 }), '0 sets');
});

test('zh needs only _other, also for count 1', () => {
  const t = createTranslator('zh-Hans', { sets_other: '{count} 组' }, en);
  assert.equal(t('sets', { count: 1 }), '1 组');
  assert.equal(t('sets', { count: 3 }), '3 组');
});

test('count with a plain key falls back to the key itself', () => {
  const t = createTranslator('en', {}, { n: { en: '{count} items', note: 'x' } });
  assert.equal(t('n', { count: 2 }), '2 items');
});

test('zh with a different placeholder set uses English', () => {
  const missing = createTranslator('zh-Hans', { sets_other: '很多组' }, en);
  assert.equal(missing('sets', { count: 3 }), '3 sets');
  const renamed = createTranslator('zh-Hans', { sets_other: '{cnt} 组' }, en);
  assert.equal(renamed('sets', { count: 3 }), '3 sets');
  const extra = createTranslator('zh-Hans', { greet: '{name} {other}' }, en);
  assert.equal(extra('greet', { name: 'Ada' }), 'Hi Ada');
});
