/** The app's translator, bound to the current language. Pure: safe under node --test. */
import { getLang } from './current.ts';
import { createTranslator, type Vars } from './translate.ts';
import { strings } from './strings/en.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };
import ru from './strings/ru.json' with { type: 'json' };
import el from './strings/el.json' with { type: 'json' };
import es from './strings/es.json' with { type: 'json' };

const tables = { 'zh-Hans': zh, ru, el, es };

export function t(key: string, vars?: Vars): string {
  return createTranslator(getLang(), tables, strings)(key, vars);
}
