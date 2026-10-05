/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  entryAfterLookup,
  entryAfterReplace,
  entryAtFinish,
  healthEditCase,
  healthEditLine,
  healthEntryFromRow,
  healthReplacement,
  healthWindow,
  needsLookup,
  type HealthEditState,
  type HealthEntry,
} from './healthEntry.ts';

const phone: HealthEntry = { uuid: 'P-1', writer: 'phone' };
const watch: HealthEntry = { uuid: 'W-1', writer: 'watch' };

const state = (over: Partial<HealthEditState> = {}): HealthEditState => ({
  connected: true,
  entry: phone,
  canWrite: true,
  ...over,
});

const START = 1_800_000_000_000;
const HOUR = 3_600_000;

// --- the line in the Date & time sheet (E12–E14) -----------------------------

test('an entry Ischys wrote is updated on save, and the sheet says so', () => {
  assert.equal(healthEditCase(state()), 'updates');
  assert.equal(healthEditLine(state()), 'Saving updates this workout in Apple Health too.');
});

test('a Watch recording is kept, whatever the write permission is', () => {
  for (const canWrite of [true, false]) {
    const s = state({ entry: watch, canWrite });
    assert.equal(healthEditCase(s), 'watch');
    assert.equal(healthEditLine(s), 'Apple Health keeps your Watch’s recording. Only Ischys changes.');
  }
  // Known to be the Watch's even before its UUID is.
  assert.equal(healthEditCase(state({ entry: { uuid: null, writer: 'watch' } })), 'watch');
});

test('an entry Ischys wrote, with writing now off, is said to stay as it is', () => {
  const s = state({ canWrite: false });
  assert.equal(healthEditCase(s), 'writeOff');
  assert.equal(healthEditLine(s), 'Writing to Apple Health is off, so it won’t change.');
});

test('no line when Health is not connected or the workout has no entry', () => {
  assert.equal(healthEditCase(state({ connected: false })), 'none');
  assert.equal(healthEditLine(state({ connected: false })), null);
  assert.equal(healthEditCase(state({ entry: null })), 'none');
  assert.equal(healthEditLine(state({ entry: null })), null);
  // Not connected wins over anything stored from when it was.
  assert.equal(healthEditLine(state({ connected: false, entry: watch })), null);
});

// --- whether Save replaces the entry -----------------------------------------

const stored = { startedAt: START };
const untouched = { startedAt: null, durationSeconds: null, endedAt: null };

test('a save that leaves the time alone never touches Health', () => {
  // Set edits only: the plan carries no start, duration or end.
  assert.equal(healthReplacement(state(), untouched, stored), null);
});

test('a changed duration replaces the entry over the stored start and the new end', () => {
  const plan = { startedAt: null, durationSeconds: 3600, endedAt: START + HOUR };
  assert.deepEqual(healthReplacement(state(), plan, stored), {
    uuid: 'P-1',
    startedAt: START,
    endedAt: START + HOUR,
  });
});

test('a moved date or start replaces the entry over the new window', () => {
  const plan = { startedAt: START - 24 * HOUR, durationSeconds: null, endedAt: START - 23 * HOUR };
  assert.deepEqual(healthReplacement(state(), plan, stored), {
    uuid: 'P-1',
    startedAt: START - 24 * HOUR,
    endedAt: START - 23 * HOUR,
  });
});

test('a Watch recording is never replaced', () => {
  const plan = { startedAt: null, durationSeconds: 3600, endedAt: START + HOUR };
  assert.equal(healthReplacement(state({ entry: watch }), plan, stored), null);
});

test('nothing is replaced while writing is off, Health is not connected, or there is no entry', () => {
  const plan = { startedAt: null, durationSeconds: 3600, endedAt: START + HOUR };
  assert.equal(healthReplacement(state({ canWrite: false }), plan, stored), null);
  assert.equal(healthReplacement(state({ connected: false }), plan, stored), null);
  assert.equal(healthReplacement(state({ entry: null }), plan, stored), null);
});

test('an entry whose UUID is not known cannot be replaced', () => {
  const plan = { startedAt: null, durationSeconds: 3600, endedAt: START + HOUR };
  assert.equal(healthReplacement(state({ entry: { uuid: null, writer: 'phone' } }), plan, stored), null);
});

test('a window that does not run forwards is not written', () => {
  const plan = { startedAt: START + HOUR, durationSeconds: null, endedAt: START + HOUR };
  assert.equal(healthReplacement(state(), plan, stored), null);
});

// --- the window a workout's entry is looked up over --------------------------

test('the window runs from the stored start to the stored end', () => {
  assert.deepEqual(healthWindow({ startedAt: START, durationSeconds: 60, endedAt: START + HOUR }), {
    startedAt: START,
    endedAt: START + HOUR,
  });
});

test('with no stored end, the window is the start plus the duration', () => {
  assert.deepEqual(healthWindow({ startedAt: START, durationSeconds: 1800, endedAt: null }), {
    startedAt: START,
    endedAt: START + 1_800_000,
  });
});

test('a workout with no length has no window to look over', () => {
  assert.equal(healthWindow({ startedAt: START, durationSeconds: 0, endedAt: null }), null);
  assert.equal(healthWindow({ startedAt: START, durationSeconds: 0, endedAt: START }), null);
});

// --- what is recorded at finish ----------------------------------------------

test('finish: the Watch confirmed with its UUID', () => {
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: true, watchUuid: 'W-9', found: null, phoneSaved: null }),
    { uuid: 'W-9', writer: 'watch' },
  );
});

test('finish: an older Watch build confirms without a UUID, and Health supplies it when it can', () => {
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: true, watchUuid: null, found: { uuid: 'W-1', writer: 'watch' }, phoneSaved: null }),
    { uuid: 'W-1', writer: 'watch' },
  );
  // Not synced to the phone yet: the writer is known, the UUID is found later.
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: true, watchUuid: null, found: null, phoneSaved: null }),
    { uuid: null, writer: 'watch' },
  );
  // A phone entry over the same window is not the Watch's recording.
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: true, watchUuid: null, found: { uuid: 'P-1', writer: 'phone' }, phoneSaved: null }),
    { uuid: null, writer: 'watch' },
  );
});

test('finish: no confirmation, but the entry is already in Health', () => {
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: false, watchUuid: null, found: { uuid: 'W-1', writer: 'watch' }, phoneSaved: null }),
    { uuid: 'W-1', writer: 'watch' },
  );
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: false, watchUuid: null, found: { uuid: 'P-1', writer: 'phone' }, phoneSaved: null }),
    { uuid: 'P-1', writer: 'phone' },
  );
});

test('finish: the phone wrote it', () => {
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: false, watchUuid: null, found: null, phoneSaved: { saved: true, uuid: 'P-2' } }),
    { uuid: 'P-2', writer: 'phone' },
  );
  // An older native module reports the save without a UUID.
  assert.deepEqual(
    entryAtFinish({ watchConfirmed: false, watchUuid: null, found: null, phoneSaved: { saved: true, uuid: null } }),
    { uuid: null, writer: 'phone' },
  );
});

test('finish: nothing was written, so nothing is recorded', () => {
  assert.equal(
    entryAtFinish({ watchConfirmed: false, watchUuid: null, found: null, phoneSaved: { saved: false, uuid: null } }),
    null,
  );
  assert.equal(entryAtFinish({ watchConfirmed: false, watchUuid: null, found: null, phoneSaved: null }), null);
});

// --- workouts finished before any of this ------------------------------------

test('an entry is looked up when none is stored, or its UUID is missing', () => {
  assert.equal(needsLookup(null), true);
  assert.equal(needsLookup({ uuid: null, writer: 'watch' }), true);
  assert.equal(needsLookup(phone), false);
  assert.equal(needsLookup(watch), false);
});

test('what Health holds is what gets stored; finding nothing keeps what was known', () => {
  assert.deepEqual(entryAfterLookup(null, { uuid: 'W-1', writer: 'watch' }), watch);
  assert.deepEqual(entryAfterLookup({ uuid: null, writer: 'watch' }, { uuid: 'W-1', writer: 'watch' }), watch);
  assert.deepEqual(entryAfterLookup({ uuid: null, writer: 'watch' }, null), { uuid: null, writer: 'watch' });
  assert.equal(entryAfterLookup(null, null), null);
});

// --- after a replace ---------------------------------------------------------

test('a replaced entry is stored under its new UUID', () => {
  assert.deepEqual(entryAfterReplace(phone, { status: 'replaced', uuid: 'P-2' }), {
    uuid: 'P-2',
    writer: 'phone',
  });
});

test('an entry that is gone from Health is forgotten', () => {
  assert.equal(entryAfterReplace(phone, { status: 'missing' }), null);
});

test('an entry that turns out to be the Watch’s is remembered as that', () => {
  assert.deepEqual(entryAfterReplace(phone, { status: 'notOurs' }), { uuid: 'P-1', writer: 'watch' });
});

test('a refused or failed replace leaves the record as it was', () => {
  for (const status of ['denied', 'failed', 'unavailable'] as const) {
    assert.deepEqual(entryAfterReplace(phone, { status }), phone);
  }
});

// --- the stored columns ------------------------------------------------------

test('the stored columns read back as an entry only when the writer is one we know', () => {
  assert.deepEqual(healthEntryFromRow('P-1', 'phone'), phone);
  assert.deepEqual(healthEntryFromRow(null, 'watch'), { uuid: null, writer: 'watch' });
  assert.equal(healthEntryFromRow(null, null), null);
  assert.equal(healthEntryFromRow('X', null), null);
  assert.equal(healthEntryFromRow('X', 'tablet'), null);
});
