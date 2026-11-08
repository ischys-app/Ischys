#!/usr/bin/env node
/**
 * Translate new/changed English strings with DeepSeek. Languages and their files: langs.mjs.
 *
 *   node scripts/i18n/translate.mjs --lang zh-Hans|ru [--dry-run] [--retry-flagged] [--batch 60]
 *   node scripts/i18n/translate.mjs --apply-review <file> --lang zh-Hans|ru
 *
 * --dry-run: no network, no file writes; prints the counts and one sample prompt.
 *
 * Plural keys: zh has no singular, so `x_one` is skipped when `x_other` exists
 * and only `_other` is translated. ru translates four forms per count key
 * (x_one/_few/_many/_other, see expandPlurals in core.mjs).
 * ru review rows carry denyHits (deny-list words the English lacks); such a row is only
 * applied as ok when the reviewer adds "denyCleared": true.
 * The API key comes from DEEPSEEK_API_KEY only and is never printed.
 *
 * State (src/i18n/zh-Hans.state.json) keeps, per key, enHash (hash of the English the
 * translation answers) and, for ok/manual keys, zhHash (hash of the shipped Chinese).
 * The shipped guard test fails when either no longer matches, so a hand edit is caught.
 * To mark a hand fix `manual`: edit the Chinese value in its file, then set that key's
 * state to { enHash: hashEn(current English), status: 'manual', zhHash: hashEn(new Chinese) }
 * (hashEn is in scripts/i18n/core.mjs). Review never changes a manual entry.
 * Russian works the same with src/i18n/ru.state.json and ruHash. For a ru plural key the
 * English of _one is the en.ts `x_one` text; of _few/_many/_other the `x_other` text (or the
 * single form of a `plural`-tagged key).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG_NS, collectSources as collectSourcesFrom } from './sources.mjs';
import { applyReview as applyVerdicts, buildPrompt, denyHits, expandPlurals, hashEn, invalidateStale, needsTranslation, parseResponse } from './core.mjs';
import { LANGS } from './langs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let LANG;
let P;
let DENYLIST = null;
function selectLang(code) {
  LANG = LANGS[code];
  P = Object.fromEntries(Object.entries(LANG.files).map(([k, v]) => [k, join(ROOT, v)]));
  DENYLIST = P.denylist ? JSON.parse(readFileSync(P.denylist, 'utf8')) : null;
}

const API_URL = 'https://api.deepseek.com/chat/completions';
// DeepSeek's docs (api-docs.deepseek.com) list deepseek-flash as the general model; thinking is on by default, so it is disabled below. Override with DEEPSEEK_MODEL.
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
const TIMEOUT_MS = 120000;

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : fallback);
const writeJson = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};

/** English sources for the selected language: catalog notes overridden, plural forms expanded. */
async function collectSources() {
  const items = (await collectSourcesFrom(ROOT)).map((it) => {
    const note = LANG.catalogNotes?.[it.key.slice(0, it.key.indexOf(':'))];
    return note ? { ...it, note } : it;
  });
  return expandPlurals(items, LANG);
}

/** Load all target files; returns accessor functions keyed by namespaced key. */
function loadTargets() {
  const ui = readJson(P.ui, {});
  const catalog = readJson(P.catalog, {});
  for (const ns of Object.values(CATALOG_NS)) catalog[ns] ||= {};
  const plist = readJson(P.plist, {});
  const locate = (key) => {
    const i = key.indexOf(':');
    const prefix = key.slice(0, i);
    const name = key.slice(i + 1);
    if (prefix === 'ui') return [ui, name];
    if (prefix === 'plist') return [plist, name];
    return [catalog[CATALOG_NS[prefix]], name];
  };
  return {
    get: (key) => { const [o, n] = locate(key); return o[n]; },
    set: (key, v) => { const [o, n] = locate(key); o[n] = v; },
    del: (key) => { const [o, n] = locate(key); delete o[n]; },
    save: () => { writeJson(P.ui, ui); writeJson(P.catalog, catalog); writeJson(P.plist, plist); },
  };
}

function writeReview(items, state, targets) {
  const rows = items
    .filter((it) => state[it.key]?.status === 'pending' && targets.get(it.key) !== undefined)
    .map((it) => {
      const value = targets.get(it.key);
      const row = { key: it.key, en: it.en, [LANG.field]: value, note: it.note, enHash: state[it.key].enHash };
      if (DENYLIST) {
        const hits = denyHits(value, it.en, DENYLIST);
        if (hits.length) row.denyHits = hits;
      }
      return row;
    });
  writeJson(P.review, rows);
  return rows.length;
}

async function callDeepSeek(messages) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, response_format: { type: 'json_object' }, temperature: 0, thinking: { type: 'disabled' } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`DeepSeek HTTP ${res.status}`);
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('DeepSeek response had no content');
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callWithRetry(messages) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callDeepSeek(messages);
    } catch (e) {
      // Network errors (fetch TypeError) and 429/5xx are retryable. Only the message is kept, never headers.
      const retryable = e.retryable === true || e instanceof TypeError || e.name === 'TimeoutError' || e.name === 'AbortError';
      if (!retryable || attempt >= 3) throw new Error(e.retryable ? e.message : e.name === 'TimeoutError' || e.name === 'AbortError' ? 'request timed out' : e instanceof TypeError ? 'network error' : e.message);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i === -1 ? def : process.argv[i + 1];
}
const flag = (name) => process.argv.includes(name);

async function applyReview(file) {
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  const state = readJson(P.state, {});
  const targets = loadTargets();
  let r;
  try {
    r = applyVerdicts(entries, state, targets, { lang: LANG, denylist: DENYLIST });
  } catch (e) {
    console.error(`error: ${e.message}; nothing written`);
    process.exit(1);
  }
  targets.save();
  writeJson(P.state, state);
  for (const x of r.refused) console.warn(`refused ${x.key}: ${x.reason}`);
  const items = await collectSources();
  const left = writeReview(items, state, targets);
  console.log(`review applied: ${r.ok} ok, ${r.flagged} flagged (English fallback), ${r.refused.length} refused; ${left} still pending`);
}

async function main() {
  const usage = 'usage: --lang zh-Hans|ru [--dry-run] [--retry-flagged] [--batch 60] | --apply-review <file> --lang zh-Hans|ru';
  const reviewFile = arg('--apply-review');
  // Every mode needs an explicit --lang; nothing defaults to a language.
  const code = arg('--lang');
  if (!Object.hasOwn(LANGS, code ?? '')) { console.error(usage); process.exit(2); }
  selectLang(code);
  if (reviewFile) return applyReview(reviewFile);
  const batchSize = Number(arg('--batch', '60'));
  if (!Number.isInteger(batchSize) || batchSize < 1) { console.error('--batch must be a positive integer'); process.exit(2); }
  const dry = flag('--dry-run');
  if (!dry && !process.env.DEEPSEEK_API_KEY) { console.error('DEEPSEEK_API_KEY not set'); process.exit(1); }

  const glossary = readJson(P.glossary);
  const state = readJson(P.state, {});
  const items = await collectSources();
  const todo = items.filter((it) => needsTranslation(it.key, it.en, state, { retryFlagged: flag('--retry-flagged') }));
  const batches = [];
  for (let i = 0; i < todo.length; i += batchSize) batches.push(todo.slice(i, i + batchSize));

  const counts = {};
  for (const it of todo) { const ns = it.key.slice(0, it.key.indexOf(':')); counts[ns] = (counts[ns] || 0) + 1; }
  const sizes = batches.map((b) => { const p = buildPrompt(b, glossary, LANG); return p.system.length + p.user.length; });
  const total = sizes.reduce((a, b) => a + b, 0);
  console.log(`to translate: ${todo.length} of ${items.length} (${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'})`);
  console.log(`batches: ${batches.length} x up to ${batchSize}; prompt chars: total ${total}, largest ${Math.max(0, ...sizes)}`);
  if (dry) {
    if (batches.length) {
      const sample = buildPrompt(batches[0].slice(0, 5), glossary, LANG);
      console.log(`\n--- sample prompt (first 5 items of batch 1) ---\n[system]\n${sample.system}\n[user]\n${sample.user}`);
    }
    return;
  }

  const targets = loadTargets();
  const dropped = invalidateStale(todo, state, targets);
  if (dropped.length) { targets.save(); writeJson(P.state, state); console.log(`cleared ${dropped.length} outdated translations`); }
  const failed = [];
  const rejectedAll = {};
  for (const [bi, batch] of batches.entries()) {
    const { system, user } = buildPrompt(batch, glossary, LANG);
    let text;
    try {
      text = await callWithRetry([{ role: 'system', content: system }, { role: 'user', content: user }]);
    } catch (e) {
      failed.push(bi + 1);
      console.error(`batch ${bi + 1}/${batches.length} failed: ${e.message}; left pending`);
      continue;
    }
    const { ok, rejected } = parseResponse(text, batch, { untranslated: glossary.untranslated, lang: LANG });
    for (const it of batch) {
      if (it.key in ok) {
        targets.set(it.key, ok[it.key]);
        state[it.key] = { enHash: hashEn(it.en), status: 'pending' };
      } else {
        targets.del(it.key);
        // A retried flagged item that is rejected again keeps its flagged status and reason.
        if (state[it.key]?.status !== 'flagged') delete state[it.key];
        rejectedAll[it.key] = rejected[it.key];
      }
    }
    targets.save();
    writeJson(P.state, state);
    writeReview(items, state, targets);
    console.log(`batch ${bi + 1}/${batches.length}: ${Object.keys(ok).length} ok, ${Object.keys(rejected).length} rejected`);
  }
  const pending = writeReview(items, state, targets);
  console.log(`review file: ${P.review} (${pending} pending)`);
  if (DENYLIST) {
    const rows = JSON.parse(readFileSync(P.review, 'utf8')).filter((r) => r.denyHits);
    if (rows.length) console.log(`deny-list hits in ${rows.length} pending rows (need "denyCleared": true to ship as ok)`);
  }
  if (Object.keys(rejectedAll).length) {
    console.log('rejected (will be retried next run):');
    for (const [k, r] of Object.entries(rejectedAll)) console.log(`  ${k}: ${r}`);
  }
  if (failed.length) { console.error(`failed batches: ${failed.join(', ')}`); process.exitCode = 1; }
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
