/**
 * Run with: npm test — reading a profile that isn't active (#117, Ruling R18).
 *
 * Only the active profile's file and new files are migrated, so a side read
 * migrates the file first, never creates a missing file, and always closes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { sideReaderWith, type SideDeps } from './sideConnectionSequence.ts';
import { withoutComments } from './sourceScan.ts';

type Conn = { id: string };

function world(over: Partial<SideDeps<Conn>> = {}) {
  const log: string[] = [];
  const deps: SideDeps<Conn> = {
    exists: async (id) => {
      log.push(`exists ${id}`);
      return true;
    },
    open: (id) => {
      log.push(`open ${id}`);
      return { id };
    },
    migrate: async (c) => {
      log.push(`migrate ${c.id}`);
    },
    close: (c) => {
      log.push(`close ${c.id}`);
    },
    ...over,
  };
  return { log, read: sideReaderWith(deps) };
}

test('migrates before reading, then closes', async () => {
  const w = world();
  const v = await w.read('p1', async (c) => {
    w.log.push(`read ${c.id}`);
    return 7;
  });
  assert.equal(v, 7);
  assert.deepEqual(w.log, ['exists p1', 'open p1', 'migrate p1', 'read p1', 'close p1']);
});

test('a missing file is never opened (opening would create it): null', async () => {
  const w = world({ exists: async () => false });
  const v = await w.read('p1', async () => 1);
  assert.equal(v, null);
  assert.deepEqual(w.log, []);
});

test('a failed migration closes the file and does not read', async () => {
  const w = world({
    migrate: async () => {
      throw new Error('migrate');
    },
  });
  await assert.rejects(
    w.read('p1', async () => {
      w.log.push('read');
      return 1;
    }),
    /migrate/,
  );
  assert.deepEqual(w.log, ['exists p1', 'open p1', 'close p1']);
});

test('a failed read still closes the file', async () => {
  const w = world();
  await assert.rejects(
    w.read('p1', async () => {
      throw new Error('read');
    }),
    /read/,
  );
  assert.deepEqual(w.log, ['exists p1', 'open p1', 'migrate p1', 'close p1']);
});

test('data/ reads another profile only through readSideConnection', () => {
  const data = join(import.meta.dirname, '..', 'data');
  for (const file of ['profilesRepo.ts', 'exportRepo.ts']) {
    const src = withoutComments(readFileSync(join(data, file), 'utf8'));
    // openConnection is allowed only for the owner's always-open file.
    const opens = src.match(/openConnection\(([^)]*)\)/g) ?? [];
    assert.deepEqual(
      opens.filter((o) => o !== 'openConnection(OWNER_ID)'),
      [],
      `${file} opens a side connection without migrating it`,
    );
    assert.doesNotMatch(src, /closeConnection\(/, `${file} manages a side connection itself`);
  }
  assert.match(withoutComments(readFileSync(join(data, 'profilesRepo.ts'), 'utf8')), /readSideConnection\(/);
  assert.match(withoutComments(readFileSync(join(data, 'exportRepo.ts'), 'utf8')), /readSideConnection\(/);
});

test('the wiring migrates with migrateConnection and checks the file exists', () => {
  const src = withoutComments(readFileSync(join(import.meta.dirname, 'sideConnection.ts'), 'utf8'));
  assert.match(src, /migrate:\s*migrateConnection/);
  assert.match(src, /exists: profileFileExists/);
  assert.doesNotMatch(src, /useConnection\(|prepareConnection\(|seed/i);
});
