/**
 * Which languages need what for their script. Pure (no React Native imports)
 * so `node --test` loads it.
 */
import type { Lang } from './locale.ts';

/** Space Grotesk has no Cyrillic or Greek: these languages use the platform system font. */
export function usesSystemFont(lang: Lang): boolean {
  return lang === 'ru' || lang === 'el';
}

/** Longer translated exercise names wrap to two lines. */
export function allowsTwoLineNames(lang: Lang): boolean {
  return lang === 'ru' || lang === 'el' || lang === 'es';
}

/** A Language-list name in a script Space Grotesk lacks, shown while the UI is in another language. */
export function nameNeedsSystemFont(id: Lang, uiLang: Lang): boolean {
  return (id === 'el' || id === 'ru' || id === 'zh-Hans') && id !== uiLang;
}
