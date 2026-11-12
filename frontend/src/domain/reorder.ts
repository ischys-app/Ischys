/**
 * Index math for the drag-to-reorder lists (exercises, routines, profiles).
 * Pure, so node-tested; the screens only wire it to PanResponder + Animated.
 */

/** Where a row dragged `dy` points from `from` lands, in a list of `n` rows `slot` points apart. */
export function dropIndex(from: number, dy: number, slot: number, n: number): number {
  return Math.max(0, Math.min(n - 1, from + Math.round(dy / slot)));
}

/** A copy of `items` with the item at `from` moved to `to`. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * How far the row at `j` moves out of the way while the row at `from` is held
 * over `to`: one slot up or down for the rows in between, 0 for the rest. The
 * dragged row itself follows the finger and is not asked about.
 */
export function shiftFor(j: number, from: number, to: number, slot: number): number {
  if (to > from && j > from && j <= to) return -slot;
  if (to < from && j >= to && j < from) return slot;
  return 0;
}

/**
 * The index a screen-reader Move up / Move down lands on, or null at the end
 * of the list (nothing to do).
 */
export function stepIndex(index: number, action: 'moveUp' | 'moveDown', n: number): number | null {
  const to = action === 'moveUp' ? index - 1 : index + 1;
  return to < 0 || to >= n ? null : to;
}

/**
 * The full order to store, given the ids in their stored order and the order
 * asked for. Ids that are not stored (deleted meanwhile) are dropped, and a
 * stored id the request left out (created meanwhile) keeps its place relative
 * to the others at the end, so every row gets a distinct position 0..n-1.
 */
export function fullOrder(stored: readonly string[], requested: readonly string[]): string[] {
  const have = new Set(stored);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of requested) {
    if (have.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of stored) if (!seen.has(id)) out.push(id);
  return out;
}
