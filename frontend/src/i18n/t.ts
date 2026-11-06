/** The app's translator, bound to the current language. Pure: safe under node --test. */
import { getLang } from './current.ts';
import { createTranslator, type Vars } from './translate.ts';
import { strings } from './strings/en.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };

export function t(key: string, vars?: Vars): string {
  return createTranslator(getLang(), zh, strings)(key, vars);
}

export function isZh(): boolean {
  return getLang() === 'zh-Hans';
}
