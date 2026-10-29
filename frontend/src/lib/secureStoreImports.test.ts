/**
 * Run with: npm test — the app reaches expo-secure-store only through
 * lib/secureStore.ts.
 *
 * Imported directly, the package writes WHEN_UNLOCKED, which the Keychain
 * refuses to read or write while the phone is locked: a Watch finish with the
 * phone in a pocket failed that way. It type-checks and works on an unlocked
 * phone, so nothing but reading the source catches it. This reads the source.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from '../db/sourceScan.ts';

const FRONTEND = join(import.meta.dirname, '..', '..');
const ROOTS = ['src', 'app', 'modules'];
const WRAPPER = join('src', 'lib', 'secureStore.ts');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('only lib/secureStore.ts imports expo-secure-store', () => {
  const offenders = ROOTS.flatMap((root) => sourceFiles(join(FRONTEND, root)))
    .map((path) => relative(FRONTEND, path))
    .filter((file) => file !== WRAPPER)
    .filter((file) => /['"]expo-secure-store['"]/.test(withoutComments(readFileSync(join(FRONTEND, file), 'utf8'))));
  assert.deepEqual(offenders, [], 'import lib/secureStore instead, so writes stay readable while locked');
});

test('the wrapper writes AFTER_FIRST_UNLOCK', () => {
  const src = withoutComments(readFileSync(join(FRONTEND, WRAPPER), 'utf8'));
  assert.match(src, /keychainAccessible:\s*Native\.AFTER_FIRST_UNLOCK/);
  for (const write of ['setItem', 'setItemAsync']) {
    assert.match(src, new RegExp(`${write}: \\(key, value\\) => Native\\.${write}\\(key, value, WRITE\\)`), `${write} drops the accessibility`);
  }
  // And nothing reaches the package around the migrating store.
  assert.equal(src.match(/Native\.(?:get|set|delete)Item/g)?.length, 5);
});
