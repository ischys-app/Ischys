/** Pure translator core: zh lookup with English fallback. No native imports. */
import type { Lang } from './locale.ts';

export type StringDef = { en: string; note: string };
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
    name in vars ? String(vars[name]) : whole,
  );
}

export function createTranslator(
  lang: Lang,
  zh: Record<string, string>,
  en: Record<string, StringDef>,
): (key: string, vars?: Vars) => string {
  return (key, vars) => {
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
