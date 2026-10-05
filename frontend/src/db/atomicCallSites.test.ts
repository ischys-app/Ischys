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

/**
 * Comments out, so the files that explain the trap may name it. Strings and
 * template literals are walked, not skipped over blindly: a `//` or `/*`
 * inside one (a URL, a glob) is text, and must not hide the code after it.
 * Regex literals are not recognised; one holding a quote can hide the rest of
 * its line, which is what the type on `db.transaction` (db/client.ts) is for.
 */
function withoutComments(source: string): string {
  let out = '';
  /** What we are inside: a quote character, or '}' for a `${…}` in a template. */
  const inside: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const top = inside[inside.length - 1];
    if (top === "'" || top === '"' || top === '`') {
      if (c === '\\') {
        out += c + (source[i + 1] ?? '');
        i++;
        continue;
      }
      if (c === top || (top !== '`' && c === '\n')) inside.pop();
      else if (top === '`' && c === '$' && source[i + 1] === '{') {
        inside.push('}');
        out += '${';
        i++;
        continue;
      }
      out += c;
      continue;
    }
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      i--;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') inside.push(c);
    else if (c === '{' && top === '}') inside.push('{');
    else if (c === '}' && (top === '}' || top === '{')) inside.pop();
    out += c;
  }
  return out;
}

/**
 * 1-based lines where a transaction is opened with an async callback written
 * in place, with or without type arguments. A callback passed by name, or a
 * plain arrow that returns a promise, cannot be seen from the text; the type
 * on `db.transaction` rejects those, and these too.
 */
function asyncTransactionLines(source: string): number[] {
  const code = withoutComments(source);
  const lines: number[] = [];
  for (const match of code.matchAll(/\.transaction\s*(?:<[^;]*?>)?\s*\(\s*async\b/g)) {
    lines.push(code.slice(0, match.index).split('\n').length);
  }
  return lines;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|typecheck)\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('the scan sees an async transaction callback however it is laid out', () => {
  assert.deepEqual(asyncTransactionLines('await db.transaction(async (tx) => {});'), [1]);
  assert.deepEqual(asyncTransactionLines('const a = 1;\nawait tx.transaction(\n  async function (inner) {},\n);'), [2]);
  assert.deepEqual(asyncTransactionLines('db.transaction(async(tx) => {})'), [1]);
  assert.deepEqual(asyncTransactionLines('await db.transaction<void>(async (tx) => {});'), [1]);
  assert.deepEqual(asyncTransactionLines('db.transaction<Map<string, number[]>>(\n  async (tx) => new Map(),\n);'), [1]);
  assert.deepEqual(asyncTransactionLines('db.transaction <Promise<void>> (async () => {})'), [1]);
});

test('the scan is not thrown off by comment marks inside strings', () => {
  assert.deepEqual(asyncTransactionLines("const u = 'https://ischys.app'; db.transaction(async (tx) => {});"), [1]);
  assert.deepEqual(asyncTransactionLines('const g = "src/**/*.ts";\ndb.transaction(async (tx) => {});\nconst h = "*/";'), [2]);
  assert.deepEqual(asyncTransactionLines('const t = `${a}//${b}`; db.transaction(async (tx) => {});'), [1]);
  assert.deepEqual(asyncTransactionLines('const t = `a ${f({ b: `/*` })} c`;\ndb.transaction(async (tx) => {});'), [2]);
  assert.deepEqual(asyncTransactionLines("const q = 'it\\'s // fine'; db.transaction(async (tx) => {});"), [1]);
  // A real comment after a string still goes.
  assert.deepEqual(asyncTransactionLines("const u = 'x'; // db.transaction(async (tx) => {})"), []);
});

test('the scan leaves the synchronous form, the helper and comments alone', () => {
  assert.deepEqual(asyncTransactionLines('db.transaction((tx) => { tx.insert(t).values(v).run(); });'), []);
  assert.deepEqual(asyncTransactionLines('await atomically(async (tx) => {});'), []);
  assert.deepEqual(asyncTransactionLines('// not db.transaction(async (tx) => …)\n/* nor\n db.transaction(async … */'), []);
  assert.deepEqual(asyncTransactionLines('type E = Parameters<typeof db.transaction>[0];'), []);
  assert.deepEqual(asyncTransactionLines('db.transaction<number>((tx) => tx.select().from(t).all().length);'), []);
  assert.deepEqual(asyncTransactionLines('type E = Parameters<Parameters<typeof db.transaction>[0]>[0];\nawait atomically(async () => {});'), []);
});

test('the cases the type must reject are ones the scan would have caught too', () => {
  // src/db/syncTransaction.typecheck.ts writes the forbidden forms on purpose
  // (each under a @ts-expect-error), so it is left out of the scan below.
  const cases = readFileSync(join(FRONTEND, 'src', 'db', 'syncTransaction.typecheck.ts'), 'utf8');
  assert.equal(asyncTransactionLines(cases).length, 2);
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
