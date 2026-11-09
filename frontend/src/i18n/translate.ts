/** Pure translator core: per-language lookup with English fallback. No native imports. */
import type { Lang } from './locale.ts';
import { ruPlural } from './plural.ts';

/** `plural` names the count variable for a key that has no _one/_other pair. */
export type StringDef = { en: string; note: string; plural?: string };
export type Tables = Partial<Record<Exclude<Lang, 'en'>, Record<string, string>>>;
export type Vars = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

function placeholders(s: string): string[] {
  return [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
}

function samePlaceholders(a: string, b: string): boolean {
  const pa = placeholders(a);
  const pb = placeholders(b);
  return pa.length === pb.length && pa.every((p, i) => p === pb[i]);
}

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(PLACEHOLDER, (whole, name: string) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

function translateRu(
  ru: Record<string, string>,
  en: Record<string, StringDef>,
  key: string,
  vars?: Vars,
): string | undefined {
  const isPair = en[`${key}_one`] !== undefined || en[`${key}_other`] !== undefined;
  const countVar = en[key]?.plural ?? 'count';
  const n = vars?.[countVar];
  if (isPair || en[key]?.plural !== undefined) {
    if (typeof n !== 'number') return undefined;
    const cat = ruPlural(n);
    const found = ru[`${key}_${cat}`];
    // _one was translated from the English singular; every other form from the plural.
    const source = (cat === 'one' ? en[`${key}_one`] : undefined) ?? en[`${key}_other`] ?? en[key];
    if (found !== undefined && source !== undefined && samePlaceholders(found, source.en)) {
      return interpolate(found, vars);
    }
    return undefined;
  }
  const found = ru[key];
  const source = en[key];
  if (found !== undefined && source !== undefined && samePlaceholders(found, source.en)) {
    return interpolate(found, vars);
  }
  return undefined;
}

export function createTranslator(
  lang: Lang,
  tables: Tables,
  en: Record<string, StringDef>,
): (key: string, vars?: Vars) => string {
  const zh = tables['zh-Hans'] ?? {};
  const ru = tables.ru ?? {};
  return (key, vars) => {
    if (lang === 'ru') {
      const r = translateRu(ru, en, key, vars);
      if (r !== undefined) return r;
    }
    // With a count, prefer the plural form, then the bare key. zh has no
    // singular, so its _other also serves count 1.
    const forms: string[] = [];
    if (vars && typeof vars.count === 'number') {
      forms.push(vars.count === 1 ? `${key}_one` : `${key}_other`);
      if (vars.count === 1) forms.push(`${key}_other`);
    }
    forms.push(key);

    if (lang === 'zh-Hans') {
      for (const f of forms) {
        const z = zh[f];
        const e = en[f];
        // A zh string whose placeholders differ from English would render
        // wrong; skip it so English is used instead.
        if (z !== undefined && e !== undefined && samePlaceholders(z, e.en)) {
          return interpolate(z, vars);
        }
      }
    }
    for (const f of forms) {
      // _other is only a zh fallback for count 1; English count 1 needs _one or the bare key.
      if (vars?.count === 1 && f === `${key}_other`) continue;
      const e = en[f];
      if (e !== undefined) return interpolate(e.en, vars);
    }
    return key;
  };
}
