/** Run with: npm test — the note a new workout-exercise starts with (#137). */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { previousNoteHint, startingNote } from './keepNotes.ts';

test('off: a session starts with no note, as before', () => {
  assert.equal(startingNote({ keep: false, status: 'active', previous: 'Seat at 4' }), null);
});

test('on: the previous session note is carried into a live workout', () => {
  assert.equal(startingNote({ keep: true, status: 'active', previous: 'Seat at 4' }), 'Seat at 4');
});

test('on: nothing to carry when the previous session had no note', () => {
  assert.equal(startingNote({ keep: true, status: 'active', previous: null }), null);
  assert.equal(startingNote({ keep: true, status: 'active', previous: '   ' }), null);
});

test('on: the carried note is trimmed', () => {
  assert.equal(startingNote({ keep: true, status: 'active', previous: '  Seat at 4 \n' }), 'Seat at 4');
});

test('on: only a live workout carries a note', () => {
  assert.equal(startingNote({ keep: true, status: 'completed', previous: 'Seat at 4' }), null);
  assert.equal(startingNote({ keep: true, status: undefined, previous: 'Seat at 4' }), null);
});

test('off: the previous note is still the placeholder hint', () => {
  assert.equal(previousNoteHint(false, 'Seat at 4'), 'Seat at 4');
  assert.equal(previousNoteHint(false, null), null);
});

test('on: the previous note is not offered as a hint, so a clear stays cleared', () => {
  assert.equal(previousNoteHint(true, 'Seat at 4'), null);
});
