/** Display names for catalog data. Pure; stored (English) values are never changed. */
import type { Lang } from './locale.ts';
import { fold } from '../domain/fold.ts';
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from './catalog/zh-Hans.json' with { type: 'json' };
import ru from './catalog/ru.json' with { type: 'json' };
import el from './catalog/el.json' with { type: 'json' };
import es from './catalog/es.json' with { type: 'json' };
import { strings } from './strings/en.ts';
import uiZh from './strings/zh-Hans.json' with { type: 'json' };
import uiRu from './strings/ru.json' with { type: 'json' };
import uiEl from './strings/el.json' with { type: 'json' };
import uiEs from './strings/es.json' with { type: 'json' };
import { createTranslator } from './translate.ts';

type Named = { id: string; name: string };
type Dict = Record<string, string>;

const byId = (rows: readonly Named[]): Dict => Object.fromEntries(rows.map((r) => [r.id, r.name]));
const englishExercises = byId(catalog.exercises);
const englishMuscles = byId(catalog.muscles);
const englishCategories = byId(catalog.categories);

type Table = { exercises: Dict; muscles: Dict; categories: Dict; groups: Dict; equipment: Dict };

/** The catalog table for a language; English has none (stored values show). */
function tableFor(lang: Lang): Table | undefined {
  if (lang === 'zh-Hans') return zh as Table;
  if (lang === 'ru') return ru as Table;
  if (lang === 'el') return el as Table;
  if (lang === 'es') return es as Table;
  return undefined;
}

function pick(
  lang: Lang,
  english: Dict,
  section: Exclude<keyof Table, 'groups' | 'equipment'>,
  id: string,
  stored: string,
): string {
  const table = tableFor(lang);
  if (!table) return stored;
  if (english[id] !== stored) return stored;
  return table[section][id] || stored;
}

export function exerciseLabel(
  ex: { id: string; name: string; isCustom?: number | boolean },
  lang: Lang,
): string {
  if (ex.isCustom) return ex.name;
  return pick(lang, englishExercises, 'exercises', ex.id, ex.name);
}

export function muscleLabel(m: Named, lang: Lang): string {
  return pick(lang, englishMuscles, 'muscles', m.id, m.name);
}

export function categoryLabel(c: Named, lang: Lang): string {
  return pick(lang, englishCategories, 'categories', c.id, c.name);
}

export function groupLabel(group: string, lang: Lang): string {
  return tableFor(lang)?.groups[group] || group;
}

export function equipmentLabel(value: string, lang: Lang): string {
  return tableFor(lang)?.equipment[value] || value;
}

/** Case- and accent-insensitive substring match against any label. */
export function matchesSearch(query: string, labels: readonly string[]): boolean {
  const q = fold(query.trim());
  if (!q) return true;
  return labels.some((l) => fold(l).includes(q));
}

const muscleIdByEnglish = Object.fromEntries(catalog.muscles.map((m) => [m.name, m.id]));

/** Muscle-map regions that are not catalog muscles, with their UI string keys. */
const REGION_KEYS: Dict = {
  'Front Delts': 'muscleRegion.frontDelts',
  'Side Delts': 'muscleRegion.sideDelts',
  'Rear Delts': 'muscleRegion.rearDelts',
  Obliques: 'muscleRegion.obliques',
};

/** A muscle shown by its English name only (e.g. a muscle-map region). */
export function muscleNameLabel(name: string, lang: Lang): string {
  const id = muscleIdByEnglish[name];
  if (id) return muscleLabel({ id, name }, lang);
  const key = REGION_KEYS[name];
  return key ? createTranslator(lang, { 'zh-Hans': uiZh, ru: uiRu, el: uiEl, es: uiEs }, strings)(key) : name;
}

/**
 * What a rename should write, given the edit field (pre-filled with the display
 * label). `null` means write nothing: the label was left as is, so the stored
 * English name must not be overwritten with a translation.
 */
export function nameToStore(input: string, ex: { name: string }): string | null {
  const trimmed = input.trim();
  return trimmed === ex.name ? null : trimmed;
}
