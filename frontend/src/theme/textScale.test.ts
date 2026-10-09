/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { textScale } from './textScale.ts';

test('every cap still lets text grow', () => {
  // A cap of 1 or less would switch larger text off for that element.
  for (const [name, cap] of Object.entries(textScale)) {
    assert.ok(cap > 1, `${name} must stay above 1`);
  }
});

test('the tighter the frame, the lower the cap', () => {
  assert.ok(textScale.fixed < textScale.display);
  assert.ok(textScale.display < textScale.control);
});

test('no cap reaches the accessibility sizes that broke the layouts', () => {
  // iOS's largest setting is a little over three times the default.
  for (const cap of Object.values(textScale)) assert.ok(cap <= 1.5);
});
