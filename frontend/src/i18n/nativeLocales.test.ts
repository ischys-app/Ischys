/**
 * Guard: Russian is never an iOS native localization.
 *
 * iOS picks the app's native localization (Health permission text, Paste / share menus)
 * by walking the phone's whole preferred-language list, so a phone set to Ukrainian then
 * Russian would get Russian native text while the app itself shows English. Owner's rule:
 * only phones whose first language is Russian see Russian. So Russian lives only in the
 * JS strings; locales/ru.json is kept translated but not shipped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import app from '../../app.json' with { type: 'json' };

for (const l of ['ru', 'el', 'es']) {
  test(`${l} is not an iOS native localization`, () => {
    const { expo } = app as any;
    assert.ok(!expo.ios.infoPlist.CFBundleLocalizations.includes(l), 'CFBundleLocalizations');
    assert.ok(!(l in expo.locales), 'expo.locales');
    const loc = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-localization');
    assert.ok(!loc[1].supportedLocales.ios.includes(l), 'expo-localization supportedLocales.ios');
  });
}

test('ru, el and es are Android supported locales', () => {
  const { expo } = app as any;
  const loc = expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-localization');
  for (const l of ['ru', 'el', 'es']) assert.ok(loc[1].supportedLocales.android.includes(l), l);
});
