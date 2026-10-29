/**
 * Run with: npm test — Health and the Watch are the phone owner's only (#117).
 *
 * While anyone else's profile is active nothing is read from Health, nothing
 * written to it, and no Watch session started: a client's workout must never
 * land in the owner's Health data or rings. The gate is `isOwnerActive()`, and
 * the only way to be sure every entry point asks it first is to read the
 * source. This reads the source.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { withoutComments } from '../db/sourceScan.ts';

const LIB = import.meta.dirname;
const APP = join(LIB, '..', '..', 'app');
const src = withoutComments(readFileSync(join(LIB, 'healthSync.ts'), 'utf8'));

/** The text of `name`'s body, from just inside its `{` to its matching `}`. */
function body(source: string, name: string): string {
  const at = source.search(new RegExp(`function ${name}\\s*[(<]`));
  assert.ok(at >= 0, `${name} not found`);
  // Past the parameter list, whose defaults and types may hold braces.
  let i = source.indexOf('(', at);
  for (let depth = 0; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) break;
  }
  // Past the return type too, which may be an object type: the body's `{` is
  // the first one not opening a type (after `<`, `:`, `|` or `,`).
  let open = source.indexOf('{', i);
  while (/[<:|,]\s*$/.test(source.slice(i, open))) {
    let d = 0;
    for (let k = open; k < source.length; k++) {
      if (source[k] === '{') d++;
      else if (source[k] === '}' && --d === 0) {
        open = source.indexOf('{', k);
        break;
      }
    }
  }
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}' && --depth === 0) return source.slice(open + 1, j);
  }
  throw new Error(`${name} has no closed body`);
}

/** The body's first statement, up to its first `;` or `{`. */
function firstStatement(source: string, name: string): string {
  const b = body(source, name).trimStart();
  const end = b.search(/[;{]/);
  return end < 0 ? b : b.slice(0, end + 1);
}

const GATED_FIRST = [
  'syncFinishedWorkout',
  'syncEditedWorkout',
  'syncBodyweightFromHealth',
  'syncBodyMeasurementsFromHealth',
  'startWatchSession',
  'subscribeLiveHeartRate',
  'noteWearSession',
  // Beyond the brief's list: an edit's lookup would store an owner's entry on
  // a client's workout, and connecting is the owner's to do.
  'loadHealthEditState',
  'connectHealth',
];

test('every Health and Watch entry point asks isOwnerActive() first', () => {
  for (const name of GATED_FIRST) {
    assert.match(firstStatement(src, name), /isOwnerActive\(\)/, `${name} is not owner-gated first`);
  }
});

test('the Watch listeners and pushes are owner-gated', () => {
  for (const name of [
    'ensureWatchSaveListener',
    'consumeWatchActions',
    'pushWatchState',
    'onWatchAction',
    'onWatchMetrics',
  ]) {
    assert.match(body(src, name), /isOwnerActive\(\)/, `${name} is not owner-gated`);
  }
});

test('a non-owner pushes the off state to the Watch', () => {
  assert.match(body(src, 'pushWatchState'), /buildOffWatchState\(activeProfile\(\)\.name\)/);
});

test('the root layout ignores Watch starts and finishes for a non-owner', () => {
  const layout = withoutComments(readFileSync(join(APP, '_layout.tsx'), 'utf8'));
  assert.match(body(layout, 'useWatchStart'), /isOwnerActive\(\)/);
  assert.match(body(layout, 'useWatchFinish'), /isOwnerActive\(\)/);
});
