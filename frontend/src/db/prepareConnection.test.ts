/**
 * Run with: npm test — preparing a profile's file never moves `db` (#117,
 * Ruling R9).
 *
 * A switch prepares the target file while the previous profile's screens,
 * caches and active profile are still live. If preparing pointed `db` at the
 * target, anything those screens wrote meanwhile would land in the wrong
 * profile, and a transaction opened there would go unseen by the switch. So
 * migrating and seeding work on the connection they are handed, and only
 * launch and the switch call `useConnection`. This reads the source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from './sourceScan.ts';

const DB = import.meta.dirname;
const read = (file: string) => withoutComments(readFileSync(join(DB, file), 'utf8'));

/** The text of a top-level function, from its signature to the closing brace at column 0. */
function body(src: string, name: string): string {
  const m = new RegExp(`^(?:export )?(?:async )?function ${name}\\b[^]*?^}`, 'm').exec(src);
  assert.ok(m, `${name} not found`);
  return m[0];
}

test('preparing and seeding a file never point db at it', () => {
  const src = read('bootstrap.ts');
  for (const fn of ['prepareConnection', 'seedConnection', 'runMigrations', 'ensureLocalSettings']) {
    assert.doesNotMatch(body(src, fn), /useConnection\(/, `${fn} moves db`);
  }
});

test('useConnection is called only by launch in bootstrap', () => {
  const src = read('bootstrap.ts');
  const calls = src.match(/useConnection\(/g) ?? [];
  assert.equal(calls.length, 1, 'expected a single useConnection call, in launch');
  assert.match(body(src, 'launch'), /useConnection\(/);
});

test('seeding the catalog uses the connection it is given, not the db facade', () => {
  const src = read('catalog/seedCatalog.ts');
  assert.doesNotMatch(src, /import\s*\{[^}]*\b(db|atomically)\b[^}]*\}\s*from\s*'\.\.\/client'/);
  assert.match(src, /function seedCatalog\(\s*catalog: Catalog,\s*conn: ProfileConnection/);
});
