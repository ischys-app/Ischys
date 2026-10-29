/**
 * Run with: npm test — nothing a module holds in memory outlives a profile
 * switch (#117).
 *
 * Switching points `db` at another profile's file, but a module that cached
 * something from the old one (the unit, a summary, a picked exercise) would go
 * on serving it, or writing with it, to the new profile. Every module in
 * src/lib, src/data and src/components that keeps state at the top level either registers an
 * `onProfileSwitch` hook to drop or reload it, or is listed below with the
 * reason it holds nothing that belongs to a profile. A new cache fails here
 * until someone decides which. This reads the source.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from '../db/sourceScan.ts';

const SRC = join(import.meta.dirname, '..');
const ROOTS = ['lib', 'data', 'components'];

/** Files whose top-level state is not a profile's, and why. Path from src/. */
const ALLOWED: Record<string, string> = {
  'lib/activeProfile.ts': 'the active-profile store and the switch-hook registry themselves',
  'lib/haptics.ts': 'device setting: the haptic preference is device-wide',
  'data/ids.ts': 'process-wide monotonic clock; holds no profile data',
  'components/workout/types.ts': '`_seq` counter for temporary React keys; holds no data',
};

/** Top-level `let`/`var`, and top-level `const` Maps and Sets. */
const MUTABLE = /^(?:export\s+)?(?:let|var)\s|^(?:export\s+)?const\s+\w+(?:\s*:[^=]+)?\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\b/m;

/** A call, not the definition in activeProfile.ts. */
const REGISTERS = /(?<!function\s)onProfileSwitch\(/;

function sources(): string[] {
  const out: string[] = [];
  for (const root of ROOTS) {
    for (const entry of readdirSync(join(SRC, root), { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(entry) || /\.(test|typecheck)\.tsx?$/.test(entry)) continue;
      out.push(join(root, entry));
    }
  }
  return out;
}

const read = (file: string) => withoutComments(readFileSync(join(SRC, file), 'utf8'));

test('every module with top-level state resets it on a profile switch, or says why not', () => {
  const missing = sources().filter((file) => {
    const src = read(file);
    return MUTABLE.test(src) && !REGISTERS.test(src) && !(file in ALLOWED);
  });
  assert.deepEqual(missing, [], `register onProfileSwitch or add to ALLOWED: ${missing.join(', ')}`);
});

test('every ALLOWED entry still holds top-level state and gives a reason', () => {
  const files = new Set(sources());
  for (const [file, reason] of Object.entries(ALLOWED)) {
    assert.ok(files.has(file), `${file} no longer exists`);
    assert.ok(MUTABLE.test(read(file)), `${file} holds no top-level state; drop it from ALLOWED`);
    assert.ok(reason.trim().length > 0, `${file} needs a reason`);
  }
});

test('the scan sees the modules the spec names', () => {
  // A broken pattern or path would pass the first test by finding nothing.
  const hits = sources().filter((file) => MUTABLE.test(read(file)));
  for (const file of [
    'lib/summaryCache.ts',
    'lib/weightUnit.ts',
    'lib/effortMode.ts',
    'lib/exercisePicker.ts',
    'lib/pendingSelection.ts',
    'data/prBackfill.ts',
    'lib/healthSync.ts',
    'lib/restSession.ts',
    'lib/liveActivityBridge.ts',
    'lib/watchFinish.ts',
    'data/ids.ts',
    'components/MusclePickerSheet.tsx',
  ]) {
    assert.ok(hits.includes(file), `${relative(SRC, join(SRC, file))} not seen by the scan`);
  }
});
