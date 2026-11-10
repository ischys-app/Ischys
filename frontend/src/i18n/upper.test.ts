/** Run with: npm test — accent-free capitals for display text. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { upperDisplay } from './upper.ts';

test('Greek capitals carry no tonos', () => {
  assert.equal(upperDisplay('Προπόνηση'), 'ΠΡΟΠΟΝΗΣΗ');
  assert.equal(upperDisplay('άέήίόύώ'), 'ΑΕΗΙΟΥΩ');
  assert.equal(upperDisplay('Άσκηση'), 'ΑΣΚΗΣΗ');
});

test('dialytika forms keep their diaeresis', () => {
  assert.equal(upperDisplay('ΐ ΰ ϊ ϋ'), 'Ϊ Ϋ Ϊ Ϋ');
});

test('final sigma becomes a plain capital sigma', () => {
  assert.equal(upperDisplay('σετ ς'), 'ΣΕΤ Σ');
});

test('mixed Latin and Greek', () => {
  assert.equal(upperDisplay('Bench Πρέσα'), 'BENCH ΠΡΕΣΑ');
});

test('text without Greek equals toUpperCase', () => {
  for (const s of ['Жим лёжа', 'deadlift ß', '简体', 'Workout', '']) {
    assert.equal(upperDisplay(s), s.toUpperCase(), s);
  }
});

test('dialytika is added where the tonos fell off before ι / υ', () => {
  assert.equal(upperDisplay('Μάιος'), 'ΜΑΪΟΣ');
  assert.equal(upperDisplay('πλάι'), 'ΠΛΑΪ');
  assert.equal(upperDisplay('ρολόι'), 'ΡΟΛΟΪ');
  assert.equal(upperDisplay('τσάι'), 'ΤΣΑΪ');
  assert.equal(upperDisplay('Ρουμανική'), 'ΡΟΥΜΑΝΙΚΗ');
  assert.equal(upperDisplay('άυλος'), 'ΑΫΛΟΣ');
});

test('decomposed Greek is normalised first', () => {
  assert.equal(upperDisplay('α\u0301λμα'), 'ΑΛΜΑ');
});
