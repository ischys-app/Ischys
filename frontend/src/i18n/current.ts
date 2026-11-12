import type { Lang } from './locale.ts';

let current: Lang = 'en';
const listeners = new Set<(l: Lang) => void>();

/** The language showing now: resolved at startup, then the in-app Language setting (#136). */
export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  for (const fn of listeners) fn(l);
}

/**
 * Called after the language changes. For caches that hold text localized when
 * it was read (exercise and muscle names); drop them so the next read is in the
 * new language. Returns an unsubscribe.
 */
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
