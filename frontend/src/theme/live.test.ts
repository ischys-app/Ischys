/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activeScheme, applyTheme, byScheme, color, themed, tokensFor } from './live.ts';
import { paletteById } from './palettes.ts';
import { setFontPlatform } from './fontForLang.ts';
import { setLang } from '../i18n/current.ts';

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

test('in Russian a themed style uses the system font; English is unchanged', () => {
  setLang('ru');
  try {
    const ru = themed(() => ({ t: { fontFamily: 'SpaceGrotesk_400Regular' } }));
    assert.equal(ru.t.fontFamily, 'System');
    assert.equal((ru.t as { fontWeight?: string }).fontWeight, '400');
  } finally {
    setLang('en');
  }
  const en = themed(() => ({ t: { fontFamily: 'SpaceGrotesk_400Regular' } }));
  assert.deepEqual(en.t, { fontFamily: 'SpaceGrotesk_400Regular' });
});

test('a themed style built before the language is known follows it once set', () => {
  const styles = themed(() => ({ t: { fontFamily: 'SpaceGrotesk_700Bold' } }));
  assert.equal(styles.t.fontFamily, 'SpaceGrotesk_700Bold');
  setLang('ru');
  try {
    assert.equal(styles.t.fontFamily, 'System');
  } finally {
    setLang('en');
  }
});

test('the system font follows the injected platform', () => {
  setFontPlatform('android');
  setLang('ru');
  try {
    const styles = themed(() => ({ t: { fontFamily: 'SpaceGrotesk_500Medium' } }));
    assert.equal(styles.t.fontFamily, 'sans-serif');
  } finally {
    setLang('en');
    setFontPlatform('ios');
  }
});

test('Greek themed styles use the system font; Spanish keeps Space Grotesk', () => {
  const styles = themed(() => ({ t: { fontFamily: 'SpaceGrotesk_400Regular' } }));
  setLang('el');
  try {
    assert.equal(styles.t.fontFamily, 'System');
    setLang('es');
    assert.equal(styles.t.fontFamily, 'SpaceGrotesk_400Regular');
  } finally {
    setLang('en');
  }
});
