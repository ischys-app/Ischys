/**
 * Per-language configuration for the translation script and the shipped guard test.
 * Paths are relative to the frontend directory. No I/O.
 *
 * field: the property name used for the translation in glossary terms and review rows,
 *   and the prefix of the state's value hash (zh -> zhHash, ru -> ruHash).
 * scriptRegex: output must contain one of these characters when the English has words to translate.
 * lengthFactor: multiplies a note's "Max N characters" budget (rounded down).
 * plural: 'none' = one translated form per key; 'ru' = one/few/many/other per count key; 'one-other' = one/other (el, es).
 * catalogNotes: optional per-prefix note overrides for catalog items.
 * keepEdgeSpace: store the model's text with exactly the English source's leading and
 *   trailing whitespace (fragments like " into {name}"); otherwise the output is trimmed.
 */
export const LANGS = {
  'zh-Hans': {
    code: 'zh-Hans',
    field: 'zh',
    files: {
      ui: 'src/i18n/strings/zh-Hans.json',
      catalog: 'src/i18n/catalog/zh-Hans.json',
      plist: 'locales/zh-Hans.json',
      state: 'src/i18n/zh-Hans.state.json',
      glossary: 'scripts/i18n/glossary.zh-Hans.json',
      review: '.i18n-review/zh-Hans.review.json',
    },
    promptLanguage: 'Chinese',
    scriptRegex: /[㐀-鿿豈-﫿]/,
    lengthFactor: 1,
    plural: 'none',
  },
  ru: {
    code: 'ru',
    field: 'ru',
    files: {
      ui: 'src/i18n/strings/ru.json',
      catalog: 'src/i18n/catalog/ru.json',
      plist: 'locales/ru.json',
      state: 'src/i18n/ru.state.json',
      glossary: 'scripts/i18n/glossary.ru.json',
      review: '.i18n-review/ru.review.json',
      denylist: 'scripts/i18n/denylist.ru.json',
    },
    promptLanguage: 'Russian',
    scriptRegex: /[Ѐ-ӿ]/,
    lengthFactor: 1.35,
    plural: 'ru',
    keepEdgeSpace: true,
    catalogNotes: {
      ex: 'Exercise name (gym exercise; keep equipment in parentheses translated, e.g. (штанга)). Use the common Russian gym name.',
    },
  },
  el: {
    code: 'el',
    field: 'el',
    files: {
      ui: 'src/i18n/strings/el.json',
      catalog: 'src/i18n/catalog/el.json',
      state: 'src/i18n/el.state.json',
      glossary: 'scripts/i18n/glossary.el.json',
      review: '.i18n-review/el.review.json',
      denylist: 'scripts/i18n/denylist.el.json',
    },
    promptLanguage: 'Greek',
    scriptRegex: /[Ͱ-Ͽἀ-῿]/,
    lengthFactor: 1.35,
    plural: 'one-other',
    keepEdgeSpace: true,
    catalogNotes: {
      ex: 'Exercise name (gym exercise; keep equipment in parentheses translated, e.g. (μπάρα)). Use the common Greek gym name.',
    },
  },
  es: {
    code: 'es',
    field: 'es',
    files: {
      ui: 'src/i18n/strings/es.json',
      catalog: 'src/i18n/catalog/es.json',
      state: 'src/i18n/es.state.json',
      glossary: 'scripts/i18n/glossary.es.json',
      review: '.i18n-review/es.review.json',
      denylist: 'scripts/i18n/denylist.es.json',
    },
    promptLanguage: 'Spanish',
    scriptRegex: /[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ¿¡]/,
    lengthFactor: 1.35,
    plural: 'one-other',
    keepEdgeSpace: true,
    catalogNotes: {
      ex: 'Exercise name (gym exercise; keep equipment in parentheses translated, e.g. (barra)). Use the common Spanish gym name.',
    },
  },
};
