/** Presentation formatters for dashboard data. No external date libs. */
import { type Unit, localizeNumber, volumeToDisplay } from '../domain/units.ts';
import { getLang } from '../i18n/current.ts';
import type { Lang } from '../i18n/locale.ts';
import { strings } from '../i18n/strings/en.ts';
import zh from '../i18n/strings/zh-Hans.json' with { type: 'json' };
import ru from '../i18n/strings/ru.json' with { type: 'json' };
import { createTranslator } from '../i18n/translate.ts';

const WEEKDAY_UPPER = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_TITLE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_UPPER = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
// NOTE: the Chinese date literals below (WEEKDAY_ZH, zhDay) are hand-written.
// They are outside the translation review state (zh-Hans.state.json) and the
// shipped guard, so change them by hand and review them yourself.
const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** Chinese month-day, e.g. "7月8日"; with year, "2026年7月8日". */
function zhDay(d: Date, withYear: boolean): string {
  return `${withYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日`;
}
// NOTE: the Russian date literals below are hand-written too, outside the
// translation review state. Months are genitive with a day ("8 ноября") and
// nominative on their own ("Ноябрь 2026"). No "г." after the year.
const WEEKDAY_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAY_RU_UPPER = WEEKDAY_RU.map((w) => w.toUpperCase());
const MONTH_RU_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_RU_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/** Genitive abbreviations for a day + month ("9 сент."); мая/июня/июля stay whole. */
const MONTH_RU_GEN_SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTH_RU_SHORT = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

/** Russian day + genitive month, e.g. "8 ноября"; with year, "8 ноября 2026". */
function ruDay(d: Date, withYear: boolean): string {
  return `${d.getDate()} ${MONTH_RU_GEN[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}
const MONTH_TITLE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Translate in an explicit language, so callers (and tests) can pin it. */
function tr(key: string, lang: Lang, vars?: Record<string, string | number>): string {
  return createTranslator(lang, { 'zh-Hans': zh, ru }, strings)(key, vars);
}

/** Parse an ISO string. Date-only (YYYY-MM-DD) is read in local time to avoid a UTC day-shift. */
/** Ends with `Z`, `+hh:mm`, `-hh:mm`, `+hhmm` or `-hhmm`. */
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/i;

function parse(iso: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  // Some timestamps arrive without an offset, and ECMAScript reads an
  // offset-less date-time as *local* — three hours out in Athens. Treat it as
  // UTC, the instant it denotes. Kept in step with lib/serverTime.ts rather
  // than imported from it; this module's only import is the pure units.ts,
  // so `node --test` can run it.
  return new Date(HAS_OFFSET.test(iso) ? iso : `${iso}Z`);
}

/** e.g. "WED · 8 JUL 2026" */
export function fmtHeaderDate(iso: string, lang: Lang = getLang()): string {
  const d = parse(iso);
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} · ${zhDay(d, true)}`;
  if (lang === 'ru') return `${WEEKDAY_RU_UPPER[d.getDay()]} · ${ruDay(d, true).toUpperCase()}`;
  return `${WEEKDAY_UPPER[d.getDay()]} · ${d.getDate()} ${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * value + unit pair for the compact VOLUME stat. Takes stored kilograms and
 * converts first, so the "k" threshold is judged on the number actually shown.
 */
export function fmtVolumeShort(kg: number, unit: Unit, lang: Lang = getLang()): { value: string; unit: string } {
  const v = volumeToDisplay(kg, unit);
  if (v >= 1000) return { value: localizeNumber((v / 1000).toFixed(1), lang), unit: `k ${unit}` };
  return { value: String(Math.round(v)), unit: ` ${unit}` };
}

/** e.g. "TUE 30 SEP" — the Routine View's last-performed line. Local time. */
export function fmtShortDayUpper(d: Date, lang: Lang = getLang()): string {
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} ${zhDay(d, false)}`;
  if (lang === 'ru') return `${WEEKDAY_RU_UPPER[d.getDay()]} ${ruDay(d, false).toUpperCase()}`;
  return `${WEEKDAY_UPPER[d.getDay()]} ${d.getDate()} ${MONTH_UPPER[d.getMonth()]}`;
}

/** seconds → "H:MM" (e.g. 10080 → "2:48") */
export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** e.g. "Tue, 7 Jul · 09:06" */
export function fmtWorkoutDate(iso: string, lang: Lang = getLang()): string {
  const d = parse(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} ${zhDay(d, false)} · ${hh}:${mm}`;
  if (lang === 'ru') return `${WEEKDAY_RU[d.getDay()]}, ${ruDay(d, false)} · ${hh}:${mm}`;
  return `${WEEKDAY_TITLE[d.getDay()]}, ${d.getDate()} ${MONTH_TITLE[d.getMonth()]} · ${hh}:${mm}`;
}

/** e.g. "Tue, 7 Jul 2026" — Exercise Detail → History tab session header. */
export function fmtDateOnly(iso: string, lang: Lang = getLang()): string {
  const d = parse(iso);
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} ${zhDay(d, true)}`;
  if (lang === 'ru') return `${WEEKDAY_RU[d.getDay()]}, ${ruDay(d, true)}`;
  return `${WEEKDAY_TITLE[d.getDay()]}, ${d.getDate()} ${MONTH_TITLE[d.getMonth()]} ${d.getFullYear()}`;
}

/** Local midnight at the start of a given date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday of the ISO week that contains `d` (local time). */
export function startOfIsoWeek(d: Date): Date {
  const day = d.getDay(); // 0..6, 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
  return monday;
}

/** Add `n` days to `d` (returns a new Date at local midnight). */
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Whole days from one local midnight to another. Rounded, not floored: a span
 * that crosses the spring clock change is an hour short of a whole number of
 * days, and flooring it filed every later day one day early.
 */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Parse an ISO string as a local Date (mirrors internal parse()). */
export function parseIso(iso: string): Date {
  return parse(iso);
}

/** e.g. "Jan 2024" — Profile subtitle "training since …". Returns '' for null/blank. */
export function fmtMonthYear(iso?: string | null, lang: Lang = getLang()): string {
  if (!iso) return '';
  const d = parse(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (lang === 'zh-Hans') return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (lang === 'ru') return `${MONTH_RU_NOM[d.getMonth()]} ${d.getFullYear()}`;
  return `${MONTH_TITLE[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Large-volume formatter for the Profile stats grid. Returns split value/unit so
 * the mono digits and the trailing unit can be styled independently.
 *   ≥ 1_000_000 → "1.84" / "M kg"
 *   ≥ 10_000    → "12.5" / "k kg"
 *   else        → "218"  / " kg"
 * Takes stored kilograms; the thresholds apply to the converted number.
 */
export function fmtVolumeLarge(kg: number, unit: Unit, lang: Lang = getLang()): { value: string; unit: string } {
  const v = volumeToDisplay(kg, unit);
  if (v >= 1_000_000) return { value: localizeNumber((v / 1_000_000).toFixed(2), lang), unit: `M ${unit}` };
  if (v >= 10_000) return { value: localizeNumber((v / 1000).toFixed(1), lang), unit: `k ${unit}` };
  return { value: String(Math.round(v)), unit: ` ${unit}` };
}

/** Human label for a `RecordMetric` (records list on Profile / summary chips). */
export function metricLabel(metric: string, lang: Lang = getLang()): string {
  switch (metric) {
    case 'best_set':
      return tr('record.bestSet', lang);
    case 'est_1rm':
      return tr('record.est1rm', lang);
    case 'best_volume':
      return tr('record.bestVolume', lang);
    case 'max_reps':
      return tr('record.maxReps', lang);
    default:
      return metric;
  }
}

/**
 * Compact "time ago" string for the Settings screen (last-synced label).
 *   < 30s   → "just now"
 *   < 60m   → "Nm ago"
 *   < 24h   → "Nh ago"
 *   else    → "Nd ago"
 * Returns an empty string when `iso` is nullish or unparseable.
 */
export function fmtAgo(iso?: string | null, now: Date = new Date(), lang: Lang = getLang()): string {
  if (!iso) return '';
  const then = parse(iso);
  if (Number.isNaN(then.getTime())) return '';
  const diffSec = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (diffSec < 30) return tr('ago.justNow', lang);
  if (diffSec < 3600) return tr('ago.minutes', lang, { n: Math.floor(diffSec / 60) });
  if (diffSec < 86_400) return tr('ago.hours', lang, { n: Math.floor(diffSec / 3600) });
  return tr('ago.days', lang, { n: Math.floor(diffSec / 86_400) });
}

/**
 * History-tab group label for a workout date:
 *   - THIS WEEK / LAST WEEK for the two most-recent Mon-Sun weeks
 *   - otherwise the calendar month, e.g. "JUL 2026".
 */
export function fmtHistoryGroupTitle(workoutIso: string, now: Date = new Date(), lang: Lang = getLang()): string {
  const w = startOfDay(parse(workoutIso));
  const thisMon = startOfIsoWeek(startOfDay(now));
  const lastMon = addDays(thisMon, -7);
  if (w.getTime() >= thisMon.getTime()) return tr('history.thisWeek', lang);
  if (w.getTime() >= lastMon.getTime()) return tr('history.lastWeek', lang);
  if (lang === 'zh-Hans') return `${w.getFullYear()}年${w.getMonth() + 1}月`;
  if (lang === 'ru') return `${MONTH_RU_NOM[w.getMonth()]} ${w.getFullYear()}`;
  return `${MONTH_UPPER[w.getMonth()]} ${w.getFullYear()}`;
}

/** epoch ms → local "HH:MM", e.g. the workout header's `STARTED 18:02`. */
export function fmtTimeOfDay(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Tue 7 Jul" / "周二 7月7日" / "Ср 9 сент." — a short day cell. Local time. */
export function fmtShortDay(d: Date, lang: Lang = getLang()): string {
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} ${zhDay(d, false)}`;
  if (lang === 'ru') return `${WEEKDAY_RU[d.getDay()]} ${d.getDate()} ${MONTH_RU_GEN_SHORT[d.getMonth()]}`;
  return `${WEEKDAY_TITLE[d.getDay()]} ${d.getDate()} ${MONTH_TITLE[d.getMonth()]}`;
}

/** "Tue, 7 Jul 2026" / "周二 2026年7月7日". Local time. */
export function fmtLongDay(d: Date, lang: Lang = getLang()): string {
  if (lang === 'zh-Hans') return `${WEEKDAY_ZH[d.getDay()]} ${zhDay(d, true)}`;
  if (lang === 'ru') return `${WEEKDAY_RU[d.getDay()]}, ${ruDay(d, true)}`;
  return `${WEEKDAY_TITLE[d.getDay()]}, ${d.getDate()} ${MONTH_TITLE[d.getMonth()]} ${d.getFullYear()}`;
}

/** "23 Jun" / "6月23日". Local time. */
export function fmtDayMonthOf(d: Date, lang: Lang = getLang()): string {
  if (lang === 'zh-Hans') return zhDay(d, false);
  if (lang === 'ru') return ruDay(d, false);
  return `${d.getDate()} ${MONTH_TITLE[d.getMonth()]}`;
}

/** "7 JUL 2026" / "2026年7月7日" — the date on the share card. Local time. */
export function fmtCardDay(d: Date, lang: Lang = getLang()): string {
  if (lang === 'zh-Hans') return zhDay(d, true);
  if (lang === 'ru') return ruDay(d, true).toUpperCase();
  return `${d.getDate()} ${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`;
}

/** Monday-first weekday initials for the week bars: always exactly seven. */
export function fmtWeekInitials(lang: Lang = getLang()): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => tr(`profile.weekLetter.${i}`, lang));
}

/**
 * "28 SEP", or "03 AUG 25" when `d` is in a different year from `newest`;
 * "6月23日" / "2025年8月3日" in Chinese. Local time.
 */
export function fmtImportDay(d: Date, newest: Date, lang: Lang = getLang()): string {
  const sameYear = d.getFullYear() === newest.getFullYear();
  if (lang === 'zh-Hans') return zhDay(d, !sameYear);
  if (lang === 'ru') return ruDay(d, !sameYear);
  const day = `${String(d.getDate()).padStart(2, '0')} ${MONTH_UPPER[d.getMonth()]}`;
  return sameYear ? day : `${day} ${String(d.getFullYear() % 100).padStart(2, '0')}`;
}

/** Month labels for a picker wheel: Jan..Dec, or 1月..12月. */
export function fmtMonthNames(lang: Lang = getLang()): readonly string[] {
  if (lang === 'ru') return MONTH_RU_SHORT;
  return lang === 'zh-Hans' ? MONTH_TITLE.map((_, i) => `${i + 1}月`) : MONTH_TITLE;
}
