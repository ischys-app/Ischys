/**
 * The temporary room under the edit screen's list (board 13b).
 *
 * A card collapsing near the bottom leaves the list too short for where it is
 * scrolled to. The scroll view would pull everything down to fit, and the row
 * would jump away from the thumb that just tapped Remove. Padding added under
 * the list keeps the scroll position valid instead, so the row's top edge
 * stays put.
 *
 * That padding is owed back: to Undo, which returns the height the collapse
 * took, and to the next scroll, after which none of it need be on screen. So
 * it is kept per collapsed card, and the padding is the sum.
 *
 * Pure, so `node --test` covers it.
 */

/** Where the list is scrolled to, and how much of it there is (tail included). */
export type ScrollMetrics = { y: number; viewport: number; content: number };

/** What each collapsed card added, by exercise id. Never holds a zero. */
export type TailShares = Readonly<Record<string, number>>;

export const NO_TAIL: TailShares = {};

export function tailTotal(shares: TailShares): number {
  let total = 0;
  for (const id in shares) total += shares[id];
  return total;
}

/**
 * After a card gives up `lost` points of height: its share is however far the
 * scroll position would otherwise be past the new end of the list. Never more
 * than was lost, which is all a collapse can cost.
 */
export function tailAfterCollapse(
  shares: TailShares,
  id: string,
  scroll: ScrollMetrics,
  lost: number,
): TailShares {
  if (!(lost > 0)) return shares;
  const end = Math.max(0, scroll.content - lost - scroll.viewport);
  const over = Math.min(lost, scroll.y - end);
  return over > 0 ? { ...shares, [id]: (shares[id] ?? 0) + over } : shares;
}

/**
 * After Undo: the card is back at its full height, which is at least what its
 * collapse added here, so that share is given back with it.
 */
export function tailAfterRestore(shares: TailShares, id: string): TailShares {
  if (!(id in shares)) return shares;
  const { [id]: _returned, ...rest } = shares;
  return rest;
}

/**
 * Once scrolling settles: keep only as much as still holds the list where it
 * is, taken from every share alike. Never grows.
 */
export function tailAfterSettle(shares: TailShares, scroll: ScrollMetrics): TailShares {
  const total = tailTotal(shares);
  if (total === 0) return shares;
  const end = Math.max(0, scroll.content - total - scroll.viewport);
  const needed = Math.max(0, scroll.y - end);
  if (needed >= total) return shares;
  if (needed === 0) return NO_TAIL;
  const keep = needed / total;
  const next: Record<string, number> = {};
  for (const id in shares) next[id] = shares[id] * keep;
  return next;
}
