/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localizeFontStyles, systemFontFor } from './fontForLang.ts';

test('Space Grotesk maps to the platform system font at the same weight', () => {
  assert.deepEqual(systemFontFor('SpaceGrotesk_600SemiBold', 'ios'), { fontFamily: 'System', fontWeight: '600' });
  assert.deepEqual(systemFontFor('SpaceGrotesk_600SemiBold', 'android'), {
    fontFamily: 'sans-serif',
    fontWeight: '600',
  });
  assert.deepEqual(systemFontFor('SpaceGrotesk_700Bold', 'ios'), { fontFamily: 'System', fontWeight: '700' });
  assert.deepEqual(systemFontFor('SpaceGrotesk_500Medium', 'ios'), { fontFamily: 'System', fontWeight: '500' });
  assert.deepEqual(systemFontFor('SpaceGrotesk_400Regular', 'android'), {
    fontFamily: 'sans-serif',
    fontWeight: '400',
  });
});

test('JetBrains Mono and other families are left alone', () => {
  assert.equal(systemFontFor('JetBrainsMono_500Medium', 'ios'), null);
  assert.equal(systemFontFor('System', 'ios'), null);
});

test('Russian swaps Space Grotesk styles for the system font', () => {
  assert.deepEqual(localizeFontStyles({ a: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 } }, 'ru', 'ios'), {
    a: { fontFamily: 'System', fontWeight: '700', fontSize: 20 },
  });
});

test('English and Chinese get the same reference back', () => {
  const styles = { a: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20 } };
  assert.equal(localizeFontStyles(styles, 'en', 'ios'), styles);
  assert.equal(localizeFontStyles(styles, 'zh-Hans', 'ios'), styles);
});

test('an explicit fontWeight wins', () => {
  const out = localizeFontStyles({ a: { fontFamily: 'SpaceGrotesk_700Bold', fontWeight: '400' as const } }, 'ru', 'ios');
  assert.deepEqual(out, { a: { fontFamily: 'System', fontWeight: '400' } });
});

test('mono styles, non-style values and frozen inputs survive in Russian', () => {
  const mono = Object.freeze({ fontFamily: 'JetBrainsMono_500Medium', fontSize: 11 });
  const input = Object.freeze({ mono, label: 'x', n: 3, t: Object.freeze({ fontFamily: 'SpaceGrotesk_400Regular' }) });
  const out = localizeFontStyles(input, 'ru', 'android');
  assert.equal(out.mono, mono);
  assert.equal(out.label, 'x');
  assert.equal(out.n, 3);
  assert.deepEqual(out.t, { fontFamily: 'sans-serif', fontWeight: '400' });
  assert.deepEqual(input.t, { fontFamily: 'SpaceGrotesk_400Regular' });
});

test('arrays and a bare style are localized too', () => {
  const list = localizeFontStyles([{ fontFamily: 'SpaceGrotesk_500Medium' }, 'a'], 'ru', 'ios');
  assert.ok(Array.isArray(list));
  assert.deepEqual(list, [{ fontFamily: 'System', fontWeight: '500' }, 'a']);
  assert.deepEqual(localizeFontStyles({ fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 9 }, 'ru', 'ios'), {
    fontFamily: 'System',
    fontWeight: '600',
    fontSize: 9,
  });
});
