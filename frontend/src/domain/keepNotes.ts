/**
 * The note a new workout-exercise starts with (#137).
 *
 * By default a session starts with no note: the last session's note only shows
 * as a placeholder, so it is gone after one workout unless retyped. With "Keep
 * exercise notes" on, that previous note is copied in as a saved value instead,
 * so it carries forward until it is changed or cleared. Only a live workout
 * gets one — never a past workout being edited, never an import.
 *
 * Pure — no imports, so `node --test` can run it. See keepNotes.test.ts.
 */
export function startingNote(opts: {
  /** The "Keep exercise notes" setting. */
  keep: boolean;
  /** The workout's status; only 'active' carries a note. */
  status: string | undefined;
  /** A note the caller set explicitly; it always wins. */
  explicit?: string | null;
  /** The note from the immediately-previous completed session, if any. */
  previous: string | null;
}): string | null {
  if (opts.explicit != null) return opts.explicit;
  if (!opts.keep || opts.status !== 'active') return null;
  const n = opts.previous?.trim();
  return n && n.length > 0 ? n : null;
}
