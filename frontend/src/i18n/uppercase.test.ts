/** Run with: npm test — guard: display capitals go through upperDisplay, never CSS or raw toUpperCase. */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'app'))].map((p) => p.slice(ROOT.length + 1));

/**
 * Non-display .toUpperCase( / .toLocaleUpperCase( uses: "file: trimmed line" -> reason.
 * Matched on the line text so edits elsewhere in the file do not break the list.
 */
const ALLOWED: Record<string, string> = {
  'src/i18n/upper.ts: if (!GREEK_ACCENTED.test(text)) return text.toUpperCase();': 'the helper itself, non-Greek path',
  'src/i18n/upper.ts: return text.replace(GREEK_ACCENTED_G, (c) => DEACCENT[c]).toUpperCase();': 'the helper itself, Greek path',
  "src/i18n/locale.ts: if (rest.some((p) => TRADITIONAL_REGIONS.has(p.toUpperCase()))) return 'en';": 'locale region subtag parsing',
  "src/components/workout/ExerciseCard.tsx: const titleCase = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);": 'sentence-case of a first letter, not all caps',
  "app/exercise/new.tsx: const titleCase = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);": 'sentence-case of a first letter, not all caps',
  'src/domain/routineView.ts: return s.length ? s[0].toUpperCase() + s.slice(1) : s;': 'sentence-case of a first letter, not all caps',
  "src/data/exercisesRepo.ts: const letters = words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();": 'stored exercise initials (data)',
  'src/data/exercisesRepo.ts: return letters || name.slice(0, 2).toUpperCase();': 'stored exercise initials (data)',
  'src/domain/units.ts: return unit.toUpperCase();': 'unit key normalisation (kg/lb), not shown text',
};

test('no CSS textTransform uppercase anywhere', () => {
  const bad = files.filter((f) => /textTransform:\s*['"]uppercase['"]/.test(readFileSync(join(ROOT, f), 'utf8')));
  assert.deepEqual(bad, []);
});

test('raw toUpperCase only on the non-display allowlist', () => {
  const found: string[] = [];
  for (const f of files) {
    for (const line of readFileSync(join(ROOT, f), 'utf8').split('\n')) {
      if (/\.(toUpperCase|toLocaleUpperCase)\(/.test(line)) found.push(`${f}: ${line.trim()}`);
    }
  }
  const unexpected = found.filter((k) => !(k in ALLOWED));
  assert.deepEqual(unexpected, []);
  const stale = Object.keys(ALLOWED).filter((k) => !found.includes(k));
  assert.deepEqual(stale, []);
});
