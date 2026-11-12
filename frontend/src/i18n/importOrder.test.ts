/** Guard: the language (and so the Russian system font) is set before any screen module builds styles. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('app/_layout.tsx imports src/i18n right after the crypto polyfill', () => {
  const src = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.equal(imports[0], 'react-native-get-random-values');
  assert.equal(imports[1], '../src/i18n');
});

test('src/i18n/index.ts injects the platform before it sets the language', () => {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const platformAt = src.indexOf('setFontPlatform(');
  const langAt = src.indexOf('setLang(effectiveLang(pref');
  assert.ok(platformAt > 0 && langAt > 0 && platformAt < langAt);
});
