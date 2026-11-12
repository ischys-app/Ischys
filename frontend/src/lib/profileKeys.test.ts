/**
 * Run with: npm test — the per-person settings are read and written under the
 * active profile's key (#117).
 *
 * `profileKey(KEY)` is the owner's key unchanged and `ischys.p.<id>.…` for
 * anyone else. A module that hands SecureStore its key directly reads and
 * writes the owner's setting whoever is using the phone, and nothing but
 * reading the source catches that. This reads the source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from '../db/sourceScan.ts';
import { PROFILE_SCOPED_KEYS } from '../domain/profiles.ts';

const LIB = import.meta.dirname;

const FILES = ['weeklyTarget.ts', 'bodyweight.ts', 'warmupVolume.ts', 'deloadState.ts', 'plateSetup.ts'];

test('every per-profile SecureStore key goes through profileKey', () => {
  for (const file of FILES) {
    const src = withoutComments(readFileSync(join(LIB, file), 'utf8'));
    assert.doesNotMatch(src, /SecureStore\.\w+\(\s*(KEY|['"]ischys\.)/, `${file} reads a profile key unscoped`);
    assert.match(src, /profileKey\(/, `${file} never scopes its key`);
  }
});

test('the scanned files hold every per-profile key', () => {
  const sources = [...FILES, 'plateSetupStore.ts']
    .map((file) => readFileSync(join(LIB, file), 'utf8'))
    .join('\n');
  for (const key of PROFILE_SCOPED_KEYS) {
    assert.ok(sources.includes(`'${key}'`), `${key} is not declared in a scanned file`);
  }
});
