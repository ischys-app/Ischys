/** Guard: a translation that has not passed review (state ok or manual) must never ship, in any language. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import plistEn from '../../locales/en.json' with { type: 'json' };
import { expandPlurals, hashEn } from '../../scripts/i18n/core.mjs';
import { LANGS } from '../../scripts/i18n/langs.mjs';
import { collectSources } from '../../scripts/i18n/sources.mjs';

const CATALOG_PREFIX: Record<string, string> = {
  exercises: 'ex',
  muscles: 'mu',
  categories: 'cat',
  groups: 'grp',
  equipment: 'eq',
};

type Lang = { code: string; field: string; files: Record<string, string> };
type Entry = { status: string; enHash?: string; [hash: string]: string | undefined };

const ROOT = process.cwd();
const readJson = <T,>(rel: string, fallback: T): T => {
  const p = join(ROOT, rel);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : fallback;
};

/** Every shipped value of a language, by namespaced key. */
function shipped(lang: Lang): Map<string, string> {
  const ui = readJson<Record<string, string>>(lang.files.ui, {});
  const catalog = readJson<Record<string, Record<string, string>>>(lang.files.catalog, {});
  const plist = readJson<Record<string, string>>(lang.files.plist, {});
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(ui)) out.set(`ui:${k}`, v);
  // locales/<lang>.json starts as a copy of the English text (the iOS fallback). Only a value that differs is translated.
  for (const [k, v] of Object.entries(plist)) {
    if (v !== (plistEn as Record<string, string>)[k]) out.set(`plist:${k}`, v);
  }
  for (const [ns, prefix] of Object.entries(CATALOG_PREFIX)) {
    for (const [k, v] of Object.entries(catalog[ns] ?? {})) out.set(`${prefix}:${k}`, v);
  }
  return out;
}

const langs = Object.values(LANGS) as Lang[];

test('LANGS covers zh-Hans and ru', () => {
  assert.deepEqual(langs.map((l) => l.code).sort(), ['ru', 'zh-Hans']);
});

for (const lang of langs) {
  const st = readJson<Record<string, Entry>>(lang.files.state, {});
  const hashField = `${lang.field}Hash`;

  test(`every shipped ${lang.code} value has state ok or manual`, () => {
    for (const key of shipped(lang).keys()) {
      const status = st[key]?.status;
      assert.ok(status === 'ok' || status === 'manual', `${key}: shipped with state ${status ?? 'missing'}`);
    }
  });

  test(`every shipped ${lang.code} value answers the current English (enHash)`, async () => {
    // Plural forms (ru) answer the English the runtime translator pairs them with.
    const items = expandPlurals(await collectSources(ROOT), lang);
    const english = new Map(items.map((i: { key: string; en: string }) => [i.key, i.en]));
    for (const key of shipped(lang).keys()) {
      const en = english.get(key);
      assert.ok(en !== undefined, `${key}: shipped but no English source`);
      assert.equal(st[key]?.enHash, hashEn(en), `${key}: English changed since this was translated`);
    }
  });

  test(`every shipped ${lang.code} value is the text that was reviewed (${hashField})`, () => {
    for (const [key, value] of shipped(lang)) {
      assert.equal(st[key]?.[hashField], hashEn(value), `${key}: edited after review; re-review it or mark it manual with a new ${hashField}`);
    }
  });
}
