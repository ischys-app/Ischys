/**
 * Display-side helpers for catalog lists: filtering, sorting and indexing by
 * the label the user sees. Pure — no DB — so node --test runs it. Stored
 * (English) values are never touched here; they ride along as `englishName`.
 */
import type { ExerciseOut } from '../api/types.ts';
import type { Lang } from '../i18n/locale.ts';
import { groupLabel, matchesSearch, muscleLabel } from '../i18n/catalogNames.ts';

const collators = new Map<Lang, Intl.Collator>();

/** Compare two labels the way the language sorts them (pinyin for zh-Hans). */
export function compareLabels(lang: Lang): (a: string, b: string) => number {
  let c = collators.get(lang);
  if (!c) {
    c = new Intl.Collator(
      lang === 'zh-Hans' ? 'zh-Hans-u-co-pinyin' : lang === 'ru' ? 'ru' : undefined,
    );
    collators.set(lang, c);
  }
  return c.compare;
}

/** A copy sorted by `name` (the display label). */
export function sortByName<T extends { name: string }>(items: readonly T[], lang: Lang): T[] {
  const cmp = compareLabels(lang);
  return [...items].sort((a, b) => cmp(a.name, b.name));
}

/** Library filter: search matches the label or the stored English name; category by id. */
export function filterExercises(
  list: readonly ExerciseOut[],
  params: { search?: string; categoryId?: string },
): ExerciseOut[] {
  return list.filter(
    (ex) =>
      (!params.categoryId || ex.category?.id === params.categoryId) &&
      (!params.search || matchesSearch(params.search, [ex.name, ex.englishName])),
  );
}

// First character of each pinyin initial, in pinyin collation order. A label's
// initial is the last boundary that sorts at or before it. (No I, U or V: no
// Mandarin syllable starts with them.)
const PINYIN_LETTERS = 'ABCDEFGHJKLMNOPQRSTWXYZ';
const PINYIN_BOUNDS = '阿八嚓哒妸发旮哈讥咔垃妈拏噢妑七呥仨他屲夕丫帀';
const HAN = /\p{Script=Han}/u;

/** Section letter for an alphabetical index: pinyin initial for a Chinese label. */
export function indexLetter(label: string, lang: Lang): string {
  const first = label[0] ?? '#';
  if (lang !== 'zh-Hans' || !HAN.test(first)) return first.toUpperCase();
  const cmp = compareLabels(lang);
  let letter = '#';
  for (let i = 0; i < PINYIN_BOUNDS.length; i++) {
    if (cmp(PINYIN_BOUNDS[i], first) <= 0) letter = PINYIN_LETTERS[i];
    else break;
  }
  return letter;
}

/** Primary-muscle tag for volume / workout cards: group, else muscle, else "Other". */
export function muscleTag(
  primary: { id: string; name: string; group: string | null } | null | undefined,
  lang: Lang,
): string {
  if (!primary) return groupLabel('Other', lang);
  return primary.group ? groupLabel(primary.group, lang) : muscleLabel(primary, lang);
}
