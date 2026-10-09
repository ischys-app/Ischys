/**
 * How History reads its list: a page at a time, as it is scrolled.
 *
 * It used to ask for the latest hundred workouts and stop, so the header said
 * "100 workouts" whatever the count, and anything older could not be opened,
 * edited or deleted. Pure, so `node --test` covers it. See historyPaging.test.ts.
 */

/** Enough rows to fill several screens, few enough to read without a pause. */
export const HISTORY_PAGE_SIZE = 50;

/**
 * `page` appended to `loaded`, newest first as both already are. A row already
 * held is not added again: a workout finished or deleted between two reads
 * shifts every offset after it by one, so a page can repeat the previous one's
 * last row.
 */
export function appendPage<T extends { id: string }>(loaded: readonly T[], page: readonly T[]): T[] {
  const held = new Set(loaded.map((w) => w.id));
  const out = loaded.slice();
  for (const w of page) {
    if (held.has(w.id)) continue;
    held.add(w.id);
    out.push(w);
  }
  return out;
}

/** Whether there is anything further down to read. */
export function hasMorePages(loadedCount: number, total: number): boolean {
  return loadedCount < total;
}

/**
 * How many rows to read when the tab comes back into view. As many as were
 * showing, so the list is still as long as the place it was scrolled to, and
 * never less than a page.
 */
export function refreshLimit(loadedCount: number, pageSize: number = HISTORY_PAGE_SIZE): number {
  return Math.max(pageSize, Math.ceil(loadedCount / pageSize) * pageSize);
}
