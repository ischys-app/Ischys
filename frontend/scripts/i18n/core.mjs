/** Pure helpers for the translation script. No I/O, no network. */
import { createHash } from 'node:crypto';
import { LANGS } from './langs.mjs';
import { upperDisplay } from '../../src/i18n/upper.ts';

const ZH = LANGS['zh-Hans'];

export function hashEn(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16);
}

/**
 * state: Record<key, { enHash, status: 'pending'|'ok'|'flagged'|'manual', zhHash?, reason? }>.
 * zhHash (ok and manual) is hashEn of the shipped Chinese; a manual edit must set it.
 * Russian uses ruHash the same way (the name is `${LANGS[lang].field}Hash`).
 * A key needs translating when it is new or its English changed. Unchanged keys
 * are skipped whatever their status, except flagged ones, which only come back
 * with retryFlagged. Manual fixes survive while the English hash is unchanged.
 */
export function needsTranslation(key, en, state, opts = { retryFlagged: false }) {
  const entry = state[key];
  if (!entry) return true;
  if (entry.enHash !== hashEn(en)) return true;
  if (entry.status === 'flagged') return Boolean(opts.retryFlagged);
  return false;
}

/** "Max 8 characters" / "Max 1 character" in a note -> number, else null. */
export function maxLength(note) {
  const m = /\bMax (\d+) characters?\b/i.exec(note || '');
  return m ? Number(m[1]) : null;
}

const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/g;
const CJK = /[㐀-鿿豈-﫿]/;
const DEFAULT_UNTRANSLATED = ['RPE', '1RM', 'PR', 'kg', 'lb', 'Ischys'];

function placeholders(s) {
  return (s.match(PLACEHOLDER) || []).sort().join('|');
}

/** True when the English has real words left after removing untranslatable tokens. */
function hasTranslatableWords(en, untranslated) {
  let rest = en.replace(PLACEHOLDER, ' ');
  for (const tok of [...untranslated].sort((a, b) => b.length - a.length)) {
    const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rest = rest.replace(new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`, 'gi'), ' ');
  }
  return /[A-Za-z]{2,}/.test(rest);
}

/** Returns a rejection reason, or null when the translation passes. lang: a LANGS entry (default zh-Hans). */
export function checkOne(item, out, untranslated, lang = ZH) {
  if (typeof out !== 'string') return 'not a string';
  if (out.trim() === '') return 'empty';
  if (placeholders(item.en) !== placeholders(out)) return 'placeholder mismatch';
  const note = maxLength(item.note);
  const max = note === null ? null : Math.floor(note * lang.lengthFactor);
  if (max !== null && [...out.trim()].length > max) return `overlong (max ${max})`;
  if (hasTranslatableWords(item.en, untranslated) && !lang.scriptRegex.test(out)) return `no ${lang.promptLanguage} characters in output`;
  return null;
}

/** The model's trimmed text wrapped in exactly the English source's leading and trailing whitespace. */
function withEdgeSpace(en, out) {
  const text = out.trim();
  if (en.trim() === '') return text;
  return en.match(/^\s*/)[0] + text + en.match(/\s*$/)[0];
}

/**
 * For a retried flagged item: append the review reason to the prompt note so the model
 * knows what to avoid. Only the note changes (enHash is computed from en). Otherwise
 * returns the item itself.
 */
export function withRetryReason(item, entry) {
  if (entry?.status !== 'flagged' || !entry.reason) return item;
  const hint = `A previous translation was rejected by review: ${String(entry.reason).replace(/[.\s]+$/, '')}. Avoid that problem.`;
  return { ...item, note: item.note ? `${item.note} ${hint}` : hint };
}

const GREEK = /[Ͱ-Ͽἀ-῿]/;

/**
 * Post-process a checked translation. Greek (field 'el'): when the English source has no
 * lowercase letters (outside {placeholders}) and the output has Greek, store the all-caps
 * display form without tonos. Placeholders are left untouched. Other languages: unchanged.
 */
export function normalizeOutput(en, out, lang) {
  if (lang.field !== 'el') return out;
  if (/[a-z]/.test(en.replace(PLACEHOLDER, ' ')) || !GREEK.test(out)) return out;
  return out.split(/(\{[A-Za-z0-9_]+\})/).map((part, i) => (i % 2 ? part : upperDisplay(part))).join('');
}

/**
 * Validate a model response against its batch.
 * Returns { ok: Record<key, zh>, rejected: Record<key, reason> }. Keys not in the batch are ignored.
 */
export function parseResponse(text, batch, opts = {}) {
  const untranslated = opts.untranslated || DEFAULT_UNTRANSLATED;
  const lang = opts.lang || ZH;
  const ok = {};
  const rejected = {};
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    for (const it of batch) rejected[it.key] = 'response was not valid JSON';
    return { ok, rejected };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    for (const it of batch) rejected[it.key] = 'response was not a JSON object';
    return { ok, rejected };
  }
  for (const it of batch) {
    if (!(it.key in obj)) {
      rejected[it.key] = 'missing from response';
      continue;
    }
    const reason = checkOne(it, obj[it.key], untranslated, lang);
    if (reason) rejected[it.key] = reason;
    else {
      const text = lang.keepEdgeSpace ? withEdgeSpace(it.en, obj[it.key]) : obj[it.key].trim();
      ok[it.key] = normalizeOutput(it.en, text, lang);
    }
  }
  return { ok, rejected };
}

/**
 * glossary: { terms: [{en, zh|ru, note?, extension?}], untranslated: string[] }.
 * lang: a LANGS entry; omitted or zh-Hans gives the Chinese prompt.
 */
export function buildPrompt(batch, glossary, lang = ZH) {
  if (lang.code === 'ru') return buildPromptRu(batch, glossary, lang);
  if (lang.code === 'el' || lang.code === 'es') return buildPromptElEs(batch, glossary, lang);
  const terms = glossary.terms.map((t) => `- ${t.en} => ${t.zh}${t.note ? ` (${t.note})` : ''}`).join('\n');
  const keep = glossary.untranslated.join(', ');
  const system = [
    'You translate UI strings for a gym workout-tracking mobile app from English into Simplified Chinese for mainland China.',
    'Rules:',
    '- Use plain, neutral, standard gym terminology. No idioms, jokes, slang, creative phrasing, or political or cultural references.',
    '- Use exactly these glossary translations:',
    terms,
    `- Keep these terms verbatim in Latin letters, never translate them: ${keep}.`,
    '- Keep every {placeholder} (for example {count}) verbatim: same names, same number of occurrences. Do not translate text inside braces.',
    '- Each string has a context note describing where it appears. Follow it. If the note states a maximum length ("Max N characters"), your translation must not exceed N Chinese characters.',
    '- Exercise, muscle and equipment names are gym terms: use the common Chinese gym name and keep any equipment in parentheses translated, for example (杠铃).',
    '- Do not add or remove punctuation, line breaks or whitespace that the English does not have, other than switching to Chinese punctuation where natural.',
    'Return only a JSON object mapping each key to its Chinese translation: {"key": "translation", ...}. Include every key exactly once and no other keys or text.',
  ].join('\n');
  const user =
    'Translate these strings. Return JSON only.\n' +
    JSON.stringify(batch.map((b) => ({ key: b.key, en: b.en, note: b.note })), null, 1);
  return { system, user };
}

function buildPromptRu(batch, glossary, lang) {
  const terms = glossary.terms.map((t) => `- ${t.en} => ${t[lang.field]}${t.note ? ` (${t.note})` : ''}`).join('\n');
  const keep = glossary.untranslated.join(', ');
  const system = [
    'You translate UI strings for a gym workout-tracking mobile app from English into Russian.',
    'Rules:',
    '- Use a neutral, polite UI register. When addressing the user, use «вы» (always lowercase) or impersonal phrasing; never use «ты».',
    '- Use plain, standard Russian gym terminology. No idioms, jokes, slang, creative phrasing, or cultural references.',
    '- Do not use any country, nationality, region, flag, political or military words unless the English string has them.',
    '- Use exactly these glossary translations (they are mandatory):',
    terms,
    `- Keep these terms verbatim in Latin letters, never translate them: ${keep}.`,
    '- Keep every {placeholder} (for example {count}) verbatim: same names, same number of occurrences. Do not translate text inside braces.',
    '- Each string has a context note describing where it appears. Follow it.',
    `- If the note states a maximum length ("Max N characters"), your translation may use at most N × ${lang.lengthFactor} characters, rounded down (Russian is longer than English). Stay as short as possible; use standard abbreviations such as повт., мин, сек where needed.`,
    '- Some notes say "Russian plural form ..." with example counts. Translate that key in the grammatical form that agrees with those counts, for example 1 подход, 2 подхода, 5 подходов, 1,5 подхода.',
    '- If a string has a number placeholder and is not marked as a plural form, phrase it so the noun does not depend on the number, for example «Подходы: {n}» instead of «{n} подходов».',
    '- Exercise, muscle and equipment names are gym terms: use the common Russian gym name and keep any equipment in parentheses translated, for example (штанга).',
    '- Do not add or remove punctuation, line breaks or whitespace that the English does not have, other than switching to Russian punctuation where natural.',
    'Return only a JSON object mapping each key to its Russian translation: {"key": "translation", ...}. Include every key exactly once and no other keys or text.',
  ].join('\n');
  const user =
    'Translate these strings. Return JSON only.\n' +
    JSON.stringify(batch.map((b) => ({ key: b.key, en: b.en, note: b.note })), null, 1);
  return { system, user };
}

const ELES_REGISTER = {
  el: [
    '- Use the informal singular «εσύ» (for example «Ξεκίνα»); never the formal plural. Use plain, standard Greek gym terminology.',
    '- ALL-CAPS English must be translated into all-caps Greek with no tonos (accent marks): THIS WEEK becomes ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ, never ΑΥΤΉ ΤΗΝ ΕΒΔΟΜΆΔΑ. Keep the dialytika (Ϊ, Ϋ).',
  ],
  es: [
    '- Write neutral Spanish with «tú» (never «usted» or «vos»). Use vocabulary shared by Spain and Latin America and standard gym terms; avoid regional slang and words used in only one region.',
    '- Never use «coger»; use «tomar» or «agarrar».',
  ],
};

function buildPromptElEs(batch, glossary, lang) {
  const terms = glossary.terms.map((t) => `- ${t.en} => ${t[lang.field]}${t.note ? ` (${t.note})` : ''}`).join('\n');
  const keep = glossary.untranslated.join(', ');
  const L = lang.promptLanguage;
  const example = lang.code === 'el' ? 'Σετ: {n}' : 'Series: {n}';
  const system = [
    `You translate UI strings for a gym workout-tracking mobile app from English into ${L}.`,
    'Rules:',
    ...ELES_REGISTER[lang.code],
    `- No idioms, jokes, slang, creative phrasing, or cultural references.`,
    '- Do not use any country, nationality, region, flag, political or military words unless the English string has them.',
    '- Use exactly these glossary translations (they are mandatory):',
    terms,
    `- Keep these terms verbatim in Latin letters, never translate them: ${keep}.`,
    '- Keep every {placeholder} (for example {count}) verbatim: same names, same number of occurrences. Do not translate text inside braces.',
    '- Each string has a context note describing where it appears. Follow it.',
    `- If the note states a maximum length ("Max N characters"), your translation may use at most N × ${lang.lengthFactor} characters, rounded down (${L} is longer than English). Stay as short as possible; use standard abbreviations where needed.`,
    `- Some notes say "${L} plural form ..." with example counts. Translate that key in the grammatical form that agrees with those counts: "one" is used for exactly 1, "other" for 0, 2, 5 and 1.5.`,
    `- If a string has a number placeholder and is not marked as a plural form, phrase it so the noun does not depend on the number, for example «${example}».`,
    `- Exercise, muscle and equipment names are gym terms: use the common ${L} gym name and keep any equipment in parentheses translated.`,
    `- Do not add or remove punctuation, line breaks or whitespace that the English does not have, other than switching to ${L} punctuation where natural.`,
    `Return only a JSON object mapping each key to its ${L} translation: {"key": "translation", ...}. Include every key exactly once and no other keys or text.`,
  ].join('\n');
  const user =
    'Translate these strings. Return JSON only.\n' +
    JSON.stringify(batch.map((b) => ({ key: b.key, en: b.en, note: b.note })), null, 1);
  return { system, user };
}

const RU_FORMS = [
  ['one', '1, 21, 101'],
  ['few', '2, 3, 4, 22'],
  ['many', '0, 5, 11, 25'],
  ['other', '1.5'],
];

const ONE_OTHER_FORMS = [
  ['one', '1'],
  ['other', '0, 2, 5, 1.5'],
];

/**
 * Plural keys carry item.plural = { base, one?, var? } (from sources.mjs): base is the
 * namespaced key without a form suffix, one the English singular of an _one/_other pair.
 * For a language with plural 'ru' each becomes base_one/_few/_many/_other ('one-other': base_one/_other); _one is
 * translated from the singular, the rest from the plural (or the single form). This
 * matches what the runtime translator looks up. Other languages: items unchanged.
 */
export function expandPlurals(items, lang = ZH) {
  if (lang.plural !== 'ru' && lang.plural !== 'one-other') return items;
  const forms = lang.plural === 'ru' ? RU_FORMS : ONE_OTHER_FORMS;
  const out = [];
  for (const it of items) {
    if (!it.plural) {
      out.push(it);
      continue;
    }
    for (const [cat, examples] of forms) {
      const hint = `${lang.promptLanguage} plural form "${cat}": used for counts like ${examples}.`;
      out.push({
        key: `${it.plural.base}_${cat}`,
        en: cat === 'one' && it.plural.one !== undefined ? it.plural.one : it.en,
        note: it.note ? `${it.note} ${hint}` : hint,
      });
    }
  }
  return out;
}

// Lowercase, ё read as е, Greek tonos and final sigma and Spanish acute accents and ü folded away (ñ stays).
const FOLD = { ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω', ΐ: 'ι', ΰ: 'υ', ϊ: 'ι', ϋ: 'υ', ς: 'σ', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u' };
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[άέήίόύώΐΰϊϋςáéíóúü]/g, (c) => FOLD[c]);
const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * denylist: { allow: [{stem}], deny: [{stem, en: string[], word?: true}] }. Returns the deny stems that
 * start (word: true = equal) a word of the translation while none of that entry's English stems starts a word
 * of the English source. Words starting with an allow stem are never flagged.
 */
export function denyHits(translated, en, denylist) {
  const allow = (denylist.allow || []).map((a) => norm(a.stem));
  const tw = words(translated).filter((w) => !allow.some((a) => w.startsWith(a)));
  const ew = words(en);
  const hits = [];
  for (const d of denylist.deny) {
    const stem = norm(d.stem);
    const match = (w, s) => (d.word ? w === s : w.startsWith(s));
    if (!tw.some((w) => match(w, stem))) continue;
    const counterpart = (d.en || []).some((e) => ew.some((w) => match(w, norm(e))));
    if (!counterpart && !hits.includes(d.stem)) hits.push(d.stem);
  }
  return hits;
}

/**
 * Before any network call: drop the stored translation and state of every item whose
 * English changed, so a failed or interrupted run can never leave an old translation
 * showing for new English. targets: { get, del }. Returns the invalidated keys.
 */
export function invalidateStale(items, state, targets) {
  const gone = [];
  for (const it of items) {
    const entry = state[it.key];
    if (entry && entry.enHash !== hashEn(it.en)) {
      targets.del(it.key);
      delete state[it.key];
      gone.push(it.key);
    }
  }
  return gone;
}

/**
 * Apply reviewer verdicts. entries: [{key, status:'ok'|'flagged', reason?, zh, enHash}]
 * (the translation sits under lang.field: zh, ru). opts: { lang, denylist }. With a denylist,
 * each entry's en must hash to the state's enHash, and an entry whose translation has
 * deny-list hits (recomputed, plus any listed in e.denyHits) is only applied as ok with
 * "denyCleared": true.
 * Throws (before mutating anything) on an unknown status. An entry is refused, not applied,
 * when its key is not pending, is manual, or its zh / enHash no longer match what was reviewed.
 * targets: { get, del }. Returns { ok, flagged, refused: [{key, reason}] }.
 */
export function applyReview(entries, state, targets, opts = {}) {
  const lang = opts.lang || ZH;
  const field = lang.field;
  if (!Array.isArray(entries)) throw new Error('review file must be a JSON array');
  for (const e of entries) {
    if (e.status !== 'ok' && e.status !== 'flagged') {
      throw new Error(`unknown review status for ${e.key}: ${JSON.stringify(e.status)}`);
    }
  }
  const result = { ok: 0, flagged: 0, refused: [] };
  for (const e of entries) {
    const s = state[e.key];
    let why = null;
    if (!s) why = 'unknown key';
    else if (s.status === 'manual') why = 'manual translation is never changed by review';
    else if (s.status !== 'pending') why = `state is ${s.status}, not pending`;
    else if (e.enHash !== s.enHash || e[field] !== targets.get(e.key)) why = 'stale: translation changed since review';
    else if (opts.denylist && (typeof e.en !== 'string' || hashEn(e.en) !== s.enHash)) why = 'stale: English missing or changed since review';
    else if (opts.denylist && e.status === 'ok' && e.denyCleared !== true) {
      const hits = new Set([...(e.denyHits || []), ...denyHits(e[field], e.en, opts.denylist)]);
      if (hits.size) why = `deny-list hits (${[...hits].join(', ')}): set "denyCleared": true to ship it`;
    }
    if (why) {
      result.refused.push({ key: e.key, reason: why });
      continue;
    }
    if (e.status === 'ok') {
      s.status = 'ok';
      s[`${field}Hash`] = hashEn(e[field]);
      delete s.reason;
      result.ok++;
    } else {
      s.status = 'flagged';
      delete s[`${field}Hash`];
      s.reason = e.reason || '';
      targets.del(e.key);
      result.flagged++;
    }
  }
  return result;
}
