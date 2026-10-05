/**
 * Run with: npm test — no `db.transaction(async …)` anywhere in the app.
 *
 * With the expo-sqlite driver that call is not a transaction: it commits when
 * the callback returns its promise, at the first `await` (db/atomic.ts). It
 * type-checks, reads correctly and works until the app is killed halfway, so
 * nothing but reading the source catches it. This reads the source.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const FRONTEND = join(import.meta.dirname, '..', '..');
const ROOTS = ['src', 'app'];

/** Comments out, so the files that explain the trap may name it. */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

/** 1-based lines where a transaction is opened with an async callback. */
function asyncTransactionLines(source: string): number[] {
  const code = withoutComments(source);
  const lines: number[] = [];
  for (const match of code.matchAll(/\.transaction\(\s*async\b/g)) {
    lines.push(code.slice(0, match.index).split('\n').length);
  }
  return lines;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('the scan sees an async transaction callback however it is laid out', () => {
  assert.deepEqual(asyncTransactionLines('await db.transaction(async (tx) => {});'), [1]);
  assert.deepEqual(asyncTransactionLines('const a = 1;\nawait tx.transaction(\n  async function (inner) {},\n);'), [2]);
  assert.deepEqual(asyncTransactionLines('db.transaction(async(tx) => {})'), [1]);
});

test('the scan leaves the synchronous form, the helper and comments alone', () => {
  assert.deepEqual(asyncTransactionLines('db.transaction((tx) => { tx.insert(t).values(v).run(); });'), []);
  assert.deepEqual(asyncTransactionLines('await atomically(async (tx) => {});'), []);
  assert.deepEqual(asyncTransactionLines('// not db.transaction(async (tx) => …)\n/* nor\n db.transaction(async … */'), []);
  assert.deepEqual(asyncTransactionLines('type E = Parameters<typeof db.transaction>[0];'), []);
});

test('no multi-statement write is opened with db.transaction(async …)', () => {
  const found: string[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(join(FRONTEND, root))) {
      for (const line of asyncTransactionLines(readFileSync(file, 'utf8'))) {
        found.push(`${relative(FRONTEND, file)}:${line}`);
      }
    }
  }
  assert.deepEqual(
    found,
    [],
    'db.transaction(async …) is not a transaction with the expo-sqlite driver: it commits at the ' +
      "callback's first await, so a crash or a throw after that leaves the write half-stored. " +
      'Use `atomically` from src/db/client.ts instead (see src/db/atomic.ts for the rule its body ' +
      'must keep).',
  );
});
