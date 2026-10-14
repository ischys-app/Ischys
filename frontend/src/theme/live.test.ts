/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activeScheme, applyTheme, byScheme, color, themed, tokensFor } from './live.ts';
import { paletteById } from './palettes.ts';

const ember = paletteById('ember');
const volt = paletteById('volt');

test('color reads whichever appearance is active', () => {
  applyTheme('dark', ember);
  assert.equal(color.bg, '#0A0A0B');
  assert.equal(color.accent, '#FF4A1C');
  applyTheme('light', ember);
  assert.equal(color.bg, '#F4F4F5');
  assert.equal(color.text1, '#0A0A0B');
  assert.equal(color.accent, '#D9380B');
  assert.equal(activeScheme(), 'light');
  applyTheme('dark', ember);
});

test('a spread of color copies the current values', () => {
  applyTheme('light', volt);
  assert.deepEqual({ ...color }, tokensFor('light', volt));
  applyTheme('dark', ember);
});

test('both appearances define every token', () => {
  assert.deepEqual(Object.keys(tokensFor('light', ember)), Object.keys(tokensFor('dark', ember)));
});

test('themed styles follow the appearance and are built once per theme', () => {
  let builds = 0;
  const styles = themed(() => {
    builds++;
    return { row: { backgroundColor: color.surface1 } };
  });
  applyTheme('dark', ember);
  assert.equal(styles.row.backgroundColor, '#111113');
  applyTheme('light', ember);
  assert.equal(styles.row.backgroundColor, '#FFFFFF');
  applyTheme('dark', ember);
  assert.equal(styles.row.backgroundColor, '#111113');
  assert.equal(builds, 2);
});

test('a themed value survives a frozen build, as React Native freezes styles in dev', () => {
  const styles = themed(() => Object.freeze({ text: Object.freeze({ color: color.text2 }) }));
  applyTheme('dark', ember);
  assert.equal(styles.text.color, '#97979E');
  applyTheme('light', ember);
  assert.equal(styles.text.color, '#55555D');
  assert.deepEqual(Object.keys(styles), ['text']);
  assert.ok('text' in styles);
  applyTheme('dark', ember);
});

test('a themed array still maps, filters and reports its length', () => {
  const list = themed(() => [color.success, color.error]);
  applyTheme('light', ember);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((c) => c.toLowerCase()), ['#0b7f43', '#d12a2a']);
  assert.ok(Array.isArray(list));
  applyTheme('dark', ember);
});

test('byScheme picks the value for the active appearance', () => {
  applyTheme('light', ember);
  assert.equal(byScheme('d', 'l'), 'l');
  applyTheme('dark', ember);
  assert.equal(byScheme('d', 'l'), 'd');
});
