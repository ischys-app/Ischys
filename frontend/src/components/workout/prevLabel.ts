/**
 * The previous-set reference in a set row's PREV cell. Pure, so it is
 * node-tested; `types.ts` re-exports it.
 */
import { getLang } from '../../i18n/current.ts';
import type { Lang } from '../../i18n/locale.ts';
import { localizeNumber } from '../../domain/units.ts';

/**
 * "60 × 8", or "× 11" for a bodyweight movement.
 *
 * No unit: the weight column's header already names it, and PREV is the row's
 * only flexible column — 76pt wide at 390pt, where "102.5 kg × 10" truncated.
 * `prevWeight` is already in the user's unit, dot-decimal; the Russian comma is
 * applied here, at display time (the pre-fill reads `prevWeight` directly).
 */
export function prevLabel(
  ex: { kind: 'weighted' | 'bodyweight' },
  s: { prevWeight?: string; prevReps?: string },
  lang: Lang = getLang(),
): string {
  if (ex.kind === 'bodyweight') {
    return s.prevReps != null ? `× ${s.prevReps}` : '';
  }
  return s.prevWeight != null ? `${localizeNumber(s.prevWeight, lang)} × ${s.prevReps ?? ''}` : '';
}
