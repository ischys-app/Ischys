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
  const t = createTranslator('zh-Hans', { 'zh-Hans': { hello: '你好' } }, en);
  assert.equal(t('hello'), '你好');
});

test('zh missing: falls back to English', () => {
  const t = createTranslator('zh-Hans', { 'zh-Hans': { hello: '你好' } }, en);
  assert.equal(t('onlyEn'), 'Only English');
});

test('en language ignores zh', () => {
  const t = createTranslator('en', { 'zh-Hans': { hello: '你好' } }, en);
  assert.equal(t('hello'), 'Hello');
});

test('key missing everywhere: returns the key and does not throw', () => {
  const t = createTranslator('zh-Hans', { 'zh-Hans': {} }, en);
  assert.equal(t('nope.nothing'), 'nope.nothing');
});

test('interpolates {name}', () => {
  const t = createTranslator('zh-Hans', { 'zh-Hans': { greet: '你好，{name}' } }, en);
  assert.equal(t('greet', { name: 'Ada' }), '你好，Ada');
  assert.equal(createTranslator('en', { 'zh-Hans': {} }, en)('greet', { name: 'Ada' }), 'Hi Ada');
});

test('count picks _one / _other in English', () => {
  const t = createTranslator('en', { 'zh-Hans': {} }, en);
  assert.equal(t('sets', { count: 1 }), '1 set');
  assert.equal(t('sets', { count: 3 }), '3 sets');
  assert.equal(t('sets', { count: 0 }), '0 sets');
});

test('zh needs only _other, also for count 1', () => {
  const t = createTranslator('zh-Hans', { 'zh-Hans': { sets_other: '{count} 组' } }, en);
  assert.equal(t('sets', { count: 1 }), '1 组');
  assert.equal(t('sets', { count: 3 }), '3 组');
});

test('count with a plain key falls back to the key itself', () => {
  const t = createTranslator('en', { 'zh-Hans': {} }, { n: { en: '{count} items', note: 'x' } });
  assert.equal(t('n', { count: 2 }), '2 items');
});

test('zh with a different placeholder set uses English', () => {
  const missing = createTranslator('zh-Hans', { 'zh-Hans': { sets_other: '很多组' } }, en);
  assert.equal(missing('sets', { count: 3 }), '3 sets');
  const renamed = createTranslator('zh-Hans', { 'zh-Hans': { sets_other: '{cnt} 组' } }, en);
  assert.equal(renamed('sets', { count: 3 }), '3 sets');
  const extra = createTranslator('zh-Hans', { 'zh-Hans': { greet: '{name} {other}' } }, en);
  assert.equal(extra('greet', { name: 'Ada' }), 'Hi Ada');
});

const enRu = {
  x_one: { en: '{count} set', note: 'n' },
  x_other: { en: '{count} sets', note: 'n' },
  y: { en: '{count} workouts', note: 'n', plural: 'count' },
  z: { en: '{n} left', note: 'n', plural: 'n' },
  w: { en: 'Hello {name}', note: 'n' },
};
const ru = {
  x_one: '{count} подход',
  x_few: '{count} подхода',
  x_many: '{count} подходов',
  x_other: '{count} подхода',
  y_one: '{count} тренировка',
  y_few: '{count} тренировки',
  y_many: '{count} тренировок',
  y_other: '{count} тренировки',
  z_few: 'Осталось {n}',
  w: 'Привет, {name}',
};

test('ru: plural forms follow the Russian rule', () => {
  const t = createTranslator('ru', { ru }, enRu);
  assert.equal(t('x', { count: 1 }), '1 подход');
  assert.equal(t('x', { count: 3 }), '3 подхода');
  assert.equal(t('x', { count: 5 }), '5 подходов');
  assert.equal(t('x', { count: 2.5 }), '2.5 подхода');
  assert.equal(t('y', { count: 21 }), '21 тренировка');
  assert.equal(t('y', { count: 12 }), '12 тренировок');
});

test('ru: custom count variable, and a missing plural form falls back to English', () => {
  const t = createTranslator('ru', { ru }, enRu);
  assert.equal(t('z', { n: 3 }), 'Осталось 3');
  assert.equal(t('z', { n: 5 }), '5 left');
});

test('ru: interpolation, placeholder mismatch, missing key, no count', () => {
  const t = createTranslator('ru', { ru }, enRu);
  assert.equal(t('w', { name: 'Аня' }), 'Привет, Аня');
  const bad = createTranslator('ru', { ru: { w: 'Привет, {имя}', x_few: '{n} подхода' } }, enRu);
  assert.equal(bad('w', { name: 'Ann' }), 'Hello Ann');
  assert.equal(bad('x', { count: 3 }), '3 sets');
  assert.equal(createTranslator('ru', { ru: {} }, enRu)('w', { name: 'Ann' }), 'Hello Ann');
  assert.equal(t('y'), '{count} workouts');
});

test('ru table is ignored for zh-Hans and en', () => {
  assert.equal(createTranslator('en', { 'zh-Hans': {}, ru }, enRu)('w', { name: 'A' }), 'Hello A');
  assert.equal(createTranslator('zh-Hans', { ru }, enRu)('w', { name: 'A' }), 'Hello A');
});

const es = {
  x_one: '{count} serie',
  x_other: '{count} series',
  z_one: 'Queda {n}',
  z_other: 'Quedan {n}',
  w: 'Hola, {name}',
};

test('es: one/other by count', () => {
  const t = createTranslator('es', { es }, enRu);
  assert.equal(t('x', { count: 1 }), '1 serie');
  assert.equal(t('x', { count: 3 }), '3 series');
});

test('es: custom count variable picks the right form', () => {
  const t = createTranslator('es', { es }, enRu);
  assert.equal(t('z', { n: 1 }), 'Queda 1');
  assert.equal(t('z', { n: 3 }), 'Quedan 3');
});

test('es: missing _one renders English; wrong placeholder renders English', () => {
  const t = createTranslator('es', { es: { x_other: '{count} series', w: 'Hola, {nombre}' } }, enRu);
  assert.equal(t('x', { count: 1 }), '1 set');
  assert.equal(t('x', { count: 3 }), '3 series');
  assert.equal(t('w', { name: 'Ana' }), 'Hello Ana');
});

test('el: uses its own table with one/other', () => {
  const el = { x_one: '{count} σετ', x_other: '{count} σετ', w: 'Γεια, {name}' };
  const t = createTranslator('el', { el, es }, enRu);
  assert.equal(t('x', { count: 2 }), '2 σετ');
  assert.equal(t('w', { name: 'Άννα' }), 'Γεια, Άννα');
});

test('es/el tables are ignored for other languages', () => {
  assert.equal(createTranslator('ru', { es }, enRu)('w', { name: 'A' }), 'Hello A');
  assert.equal(createTranslator('en', { es }, enRu)('w', { name: 'A' }), 'Hello A');
});
