/** Guard: Chinese that has not passed review (state ok or manual) must never ship. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import ui from './strings/zh-Hans.json' with { type: 'json' };
import catalog from './catalog/zh-Hans.json' with { type: 'json' };
import plist from '../../locales/zh-Hans.json' with { type: 'json' };
import plistEn from '../../locales/en.json' with { type: 'json' };
import state from './zh-Hans.state.json' with { type: 'json' };
import { hashEn } from '../../scripts/i18n/core.mjs';
import { collectSources } from '../../scripts/i18n/sources.mjs';

const CATALOG_PREFIX: Record<string, string> = {
  exercises: 'ex',
  muscles: 'mu',
  categories: 'cat',
  groups: 'grp',
  equipment: 'eq',
};

/** Every shipped zh value, by namespaced key. */
function shipped(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(ui as Record<string, string>)) out.set(`ui:${k}`, v);
  // locales/zh-Hans.json starts as a copy of the English text (the iOS fallback). Only a value that differs is Chinese.
  for (const [k, v] of Object.entries(plist as Record<string, string>)) {
    if (v !== (plistEn as Record<string, string>)[k]) out.set(`plist:${k}`, v);
  }
  for (const [ns, prefix] of Object.entries(CATALOG_PREFIX)) {
    const table = (catalog as Record<string, Record<string, string>>)[ns] ?? {};
    for (const [k, v] of Object.entries(table)) out.set(`${prefix}:${k}`, v);
  }
  return out;
}

type Entry = { status: string; enHash?: string; zhHash?: string };
const st = state as Record<string, Entry>;

test('every shipped zh-Hans value has state ok or manual', () => {
  for (const key of shipped().keys()) {
    const status = st[key]?.status;
    assert.ok(status === 'ok' || status === 'manual', `${key}: shipped with state ${status ?? 'missing'}`);
  }
});

test('every shipped value answers the current English (enHash)', async () => {
  const english = new Map((await collectSources(process.cwd())).map((i) => [i.key, i.en]));
  for (const key of shipped().keys()) {
    const en = english.get(key);
    assert.ok(en !== undefined, `${key}: shipped but no English source`);
    assert.equal(st[key]?.enHash, hashEn(en), `${key}: English changed since this was translated`);
  }
});

test('every shipped value is the text that was reviewed (zhHash)', () => {
  for (const [key, zh] of shipped()) {
    assert.equal(st[key]?.zhHash, hashEn(zh), `${key}: edited after review; re-review it or mark it manual with a new zhHash`);
  }
});
