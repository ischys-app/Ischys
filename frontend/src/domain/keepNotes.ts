/**
 * Notes under "Keep exercise notes" (#137).
 *
 * By default a session starts with no note: the last session's note only shows
 * as a placeholder, so it is gone after one workout unless retyped. With the
 * setting on, that previous note is copied in as a saved value instead, so it
 * carries forward until it is changed or cleared. Only a live workout gets one —
 * never a past workout being edited, never an import.
 *
 * Pure — no imports, so `node --test` can run it. See keepNotes.test.ts.
 */

/** The note a new workout-exercise starts with. */
export function startingNote(opts: {
  /** The "Keep exercise notes" setting. */
  keep: boolean;
  /** The workout's status; only 'active' carries a note. */
  status: string | undefined;
  /** The note from the immediately-previous completed session, if any. */
  previous: string | null;
}): string | null {
  if (!opts.keep || opts.status !== 'active') return null;
  const n = opts.previous?.trim();
  return n && n.length > 0 ? n : null;
}

/**
 * The previous session's note as a placeholder hint. Off: as before. On: none —
 * it was already carried in as the value, so a cleared note must stay cleared.
 */
export function previousNoteHint(keep: boolean, previous: string | null): string | null {
  return keep ? null : previous;
}
