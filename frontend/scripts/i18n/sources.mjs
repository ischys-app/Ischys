/**
 * The current English source of every translatable key, shared by the translation
 * script and the shipped guard test so they cannot disagree. No network, no API key.
 * Keys are namespaced: ui: ex: mu: cat: grp: eq: plist:.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CATALOG_NS = { ex: 'exercises', mu: 'muscles', cat: 'categories', grp: 'groups', eq: 'equipment' };

/** root: the frontend directory. Returns [{key, en, note, plural?: {base, one?, var}}]. */
export async function collectSources(root) {
  const items = [];
  const { strings } = await import(pathToFileURL(join(root, 'src/i18n/strings/en.ts')).href);
  for (const [k, def] of Object.entries(strings)) {
    if (k.endsWith('_one') && `${k.slice(0, -4)}_other` in strings) continue;
    const item = { key: `ui:${k}`, en: def.en, note: def.note };
    // Plural metadata for languages with several forms (see expandPlurals in core.mjs).
    if (k.endsWith('_other') && `${k.slice(0, -6)}_one` in strings) {
      item.plural = { base: `ui:${k.slice(0, -6)}`, one: strings[`${k.slice(0, -6)}_one`].en, var: 'count' };
    } else if (def.plural !== undefined) {
      item.plural = { base: `ui:${k}`, var: def.plural };
    }
    items.push(item);
  }
  const cat = JSON.parse(execFileSync('node', [join(root, 'scripts/catalogSource.mjs')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  const notes = {
    ex: 'Exercise name (gym exercise; keep equipment in parentheses translated, e.g. (杠铃)). Use the common Chinese gym name.',
    mu: 'Muscle name.',
    cat: 'Exercise category.',
    grp: 'Muscle group.',
    eq: 'Equipment type.',
  };
  for (const [prefix, ns] of Object.entries(CATALOG_NS)) {
    const src = cat[ns];
    const pairs = Array.isArray(src) ? src.map((v) => [v, v]) : Object.entries(src);
    for (const [id, en] of pairs) items.push({ key: `${prefix}:${id}`, en, note: notes[prefix] });
  }
  const plistEnPath = join(root, 'locales/en.json');
  const plistEn = existsSync(plistEnPath) ? JSON.parse(readFileSync(plistEnPath, 'utf8')) : {};
  for (const [k, en] of Object.entries(plistEn)) {
    items.push({ key: `plist:${k}`, en, note: 'iOS system permission dialog or app-name text shown by the OS. Plain, polite, accurate.' });
  }
  return items;
}
