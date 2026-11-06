/** Display names for catalog data. Pure; stored (English) values are never changed. */
import type { Lang } from './locale.ts';
import { fold } from '../domain/fold.ts';
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from './catalog/zh-Hans.json' with { type: 'json' };

type Named = { id: string; name: string };
type Dict = Record<string, string>;

const byId = (rows: readonly Named[]): Dict => Object.fromEntries(rows.map((r) => [r.id, r.name]));
const englishExercises = byId(catalog.exercises);
const englishMuscles = byId(catalog.muscles);
const englishCategories = byId(catalog.categories);

function pick(lang: Lang, english: Dict, translated: Dict, id: string, stored: string): string {
  if (lang !== 'zh-Hans') return stored;
  if (english[id] !== stored) return stored;
  return translated[id] || stored;
}

export function exerciseLabel(
  ex: { id: string; name: string; isCustom?: number | boolean },
  lang: Lang,
): string {
  if (ex.isCustom) return ex.name;
  return pick(lang, englishExercises, zh.exercises, ex.id, ex.name);
}

export function muscleLabel(m: Named, lang: Lang): string {
  return pick(lang, englishMuscles, zh.muscles, m.id, m.name);
}

export function categoryLabel(c: Named, lang: Lang): string {
  return pick(lang, englishCategories, zh.categories, c.id, c.name);
}

export function groupLabel(group: string, lang: Lang): string {
  return lang === 'zh-Hans' ? (zh.groups as Dict)[group] || group : group;
}

export function equipmentLabel(value: string, lang: Lang): string {
  return lang === 'zh-Hans' ? (zh.equipment as Dict)[value] || value : value;
}

/** Case- and accent-insensitive substring match against any label. */
export function matchesSearch(query: string, labels: readonly string[]): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return labels.some((l) => fold(l).includes(q));
}
