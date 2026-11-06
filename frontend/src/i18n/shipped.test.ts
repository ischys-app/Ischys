/** Guard: Chinese that has not passed review (state ok or manual) must never ship. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import ui from './strings/zh-Hans.json' with { type: 'json' };
import catalog from './catalog/zh-Hans.json' with { type: 'json' };
import plist from '../../locales/zh-Hans.json' with { type: 'json' };
import plistEn from '../../locales/en.json' with { type: 'json' };
import state from './zh-Hans.state.json' with { type: 'json' };

const CATALOG_PREFIX: Record<string, string> = {
  exercises: 'ex',
  muscles: 'mu',
  categories: 'cat',
  groups: 'grp',
  equipment: 'eq',
};

function shippedKeys(): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(ui)) keys.push(`ui:${k}`);
  // locales/zh-Hans.json starts as a copy of the English text (the iOS fallback). Only a value that differs is Chinese.
  for (const [k, v] of Object.entries(plist as Record<string, string>)) {
    if (v !== (plistEn as Record<string, string>)[k]) keys.push(`plist:${k}`);
  }
  for (const [ns, prefix] of Object.entries(CATALOG_PREFIX)) {
    const table = (catalog as Record<string, Record<string, string>>)[ns] ?? {};
    for (const k of Object.keys(table)) keys.push(`${prefix}:${k}`);
  }
  return keys;
}

test('every shipped zh-Hans value has state ok or manual', () => {
  const st = state as Record<string, { status: string }>;
  for (const key of shippedKeys()) {
    const status = st[key]?.status;
    assert.ok(status === 'ok' || status === 'manual', `${key}: shipped with state ${status ?? 'missing'}`);
  }
});
