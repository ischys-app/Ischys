import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { strings } from './strings/en.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };

const PLACEHOLDER = /\{(\w+)\}/g;
const ph = (s: string) => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();

test('every en entry has a non-empty en and note', () => {
  for (const [k, v] of Object.entries(strings)) {
    assert.ok(v.en.trim().length > 0, `${k}: empty en`);
    assert.ok(v.note.trim().length > 0, `${k}: empty note`);
  }
});

test('every zh key exists in en', () => {
  for (const k of Object.keys(zh as Record<string, string>)) {
    assert.ok(k in strings, `zh key not in en: ${k}`);
  }
});

test('zh placeholders match en placeholders', () => {
  for (const [k, z] of Object.entries(zh as Record<string, string>)) {
    if (!(k in strings)) continue;
    assert.deepEqual(ph(z), ph(strings[k].en), `${k}: placeholder mismatch`);
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test('every literal t() key used in source exists in en', () => {
  const files = [...walk('app'), ...walk('src')];
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?<![\w.])t\(\s*'([\w.]+)'/g)) {
      const k = m[1];
      if (!(k in strings) && !(`${k}_one` in strings) && !(`${k}_other` in strings)) {
        missing.push(`${f}: ${k}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('plural names a placeholder present in that entry', () => {
  for (const [k, v] of Object.entries(strings)) {
    if (v.plural === undefined) continue;
    assert.ok(ph(v.en).includes(v.plural), `${k}: plural "${v.plural}" is not a placeholder of its en text`);
  }
});

test('no key has both a _one/_other pair and plural', () => {
  for (const [k, v] of Object.entries(strings)) {
    if (v.plural === undefined) continue;
    assert.ok(!(`${k}_one` in strings) && !(`${k}_other` in strings), `${k}: has a pair and plural`);
    assert.ok(!/_(one|other)$/.test(k), `${k}: pair member carries plural`);
  }
});

test('known single-form count keys declare their count variable', () => {
  const expected: Record<string, string> = {
    'streak.days': 'days',
    'pr.pill': 'count',
    'home.exerciseCount': 'count',
    'history.deleteMessage': 'count',
    'history.sessions': 'count',
    'history.count': 'count',
    'profile.notTrained': 'count',
    'effort.nReps': 'n',
    'workoutEdit.ssAfterSave': 'count',
    'editDiscard.many': 'count',
    'common.setsCount': 'count',
    'summary.rampBody': 'days',
    'summary.easeOff': 'days',
    'summary.hold': 'days',
    'summary.deloadAccepted': 'days',
    'routineDiff.setsChanged': 'to',
  };
  for (const [k, v] of Object.entries(expected)) assert.equal(strings[k]?.plural, v, k);
});
