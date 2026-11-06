import type { Lang } from './locale.ts';

let current: Lang = 'en';

/** The language resolved at startup (English until index.ts sets it). */
export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  current = l;
}
