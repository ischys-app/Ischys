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
