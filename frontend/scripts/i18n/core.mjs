/** Pure helpers for the translation script. No I/O, no network. */
import { createHash } from 'node:crypto';

export function hashEn(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 16);
}

/**
 * state: Record<key, { enHash, status: 'pending'|'ok'|'flagged'|'manual', zhHash?, reason? }>.
 * zhHash (ok and manual) is hashEn of the shipped Chinese; a manual edit must set it.
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

function checkOne(item, zh, untranslated) {
  if (typeof zh !== 'string') return 'not a string';
  if (zh.trim() === '') return 'empty';
  if (placeholders(item.en) !== placeholders(zh)) return 'placeholder mismatch';
  const max = maxLength(item.note);
  if (max !== null && [...zh.trim()].length > max) return `overlong (max ${max})`;
  if (hasTranslatableWords(item.en, untranslated) && !CJK.test(zh)) return 'no Chinese characters in output';
  return null;
}

/**
 * Validate a model response against its batch.
 * Returns { ok: Record<key, zh>, rejected: Record<key, reason> }. Keys not in the batch are ignored.
 */
export function parseResponse(text, batch, opts = {}) {
  const untranslated = opts.untranslated || DEFAULT_UNTRANSLATED;
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
    const reason = checkOne(it, obj[it.key], untranslated);
    if (reason) rejected[it.key] = reason;
    else ok[it.key] = obj[it.key].trim();
  }
  return { ok, rejected };
}

/** glossary: { terms: [{en, zh, note?, extension?}], untranslated: string[] } */
export function buildPrompt(batch, glossary) {
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
 * Apply reviewer verdicts. entries: [{key, status:'ok'|'flagged', reason?, zh, enHash}].
 * Throws (before mutating anything) on an unknown status. An entry is refused, not applied,
 * when its key is not pending, is manual, or its zh / enHash no longer match what was reviewed.
 * targets: { get, del }. Returns { ok, flagged, refused: [{key, reason}] }.
 */
export function applyReview(entries, state, targets) {
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
    else if (e.enHash !== s.enHash || e.zh !== targets.get(e.key)) why = 'stale: translation changed since review';
    if (why) {
      result.refused.push({ key: e.key, reason: why });
      continue;
    }
    if (e.status === 'ok') {
      s.status = 'ok';
      s.zhHash = hashEn(e.zh);
      delete s.reason;
      result.ok++;
    } else {
      s.status = 'flagged';
      delete s.zhHash;
      s.reason = e.reason || '';
      targets.del(e.key);
      result.flagged++;
    }
  }
  return result;
}
