/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import zh from '../i18n/strings/zh-Hans.json' with { type: 'json' };
import {
  addDays,
  daysBetween,
  fmtHeaderDate,
  fmtTimeOfDay,
  fmtHistoryGroupTitle,
  fmtShortDayUpper,
  fmtVolumeLarge,
  fmtVolumeShort,
  parseIso,
} from './format.ts';

// These assertions hold in ANY timezone: they compare a naive timestamp against
// its explicit-UTC twin, rather than against a hardcoded local rendering.

test('a naive timestamp parses to the same instant as its explicit-Z twin', () => {
  assert.equal(
    parseIso('2026-07-11T05:00:00').getTime(),
    parseIso('2026-07-11T05:00:00Z').getTime(),
  );
});

test('a naive timestamp is NOT read as local time', () => {
  // The bug: `new Date('2026-07-11T05:00:00')` means 05:00 local. Only in UTC
  // is that the same instant as 05:00Z, so skip the assertion there.
  const offset = new Date(Date.UTC(2026, 6, 11)).getTimezoneOffset();
  if (offset === 0) return;
  assert.notEqual(
    parseIso('2026-07-11T05:00:00').getTime(),
    new Date('2026-07-11T05:00:00').getTime(),
  );
});

test('an explicit offset is honoured, not clobbered', () => {
  // 08:00+03:00 is the same instant as 05:00Z.
  assert.equal(
    parseIso('2026-07-11T08:00:00+03:00').getTime(),
    parseIso('2026-07-11T05:00:00Z').getTime(),
  );
});

test('a date-only string still means local midnight, not UTC midnight', () => {
  // Day grouping is about the user's calendar, so this must stay local.
  const d = parseIso('2026-07-11');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 11);
  assert.equal(d.getHours(), 0);
});

test('the header date renders the same for a naive timestamp and its Z twin', () => {
  assert.equal(fmtHeaderDate('2026-07-08T12:00:00'), fmtHeaderDate('2026-07-08T12:00:00Z'));
});

test('history groups a midday workout by the same week either way', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  assert.equal(
    fmtHistoryGroupTitle('2026-07-09T12:00:00', now),
    fmtHistoryGroupTitle('2026-07-09T12:00:00Z', now),
  );
});

// --- volume in the user's unit (storage is kg) ---

test('fmtVolumeShort keeps kg as it was and names the unit', () => {
  assert.deepEqual(fmtVolumeShort(850, 'kg'), { value: '850', unit: ' kg' });
  assert.deepEqual(fmtVolumeShort(9177, 'kg'), { value: '9.2', unit: 'k kg' });
});

test('fmtVolumeShort converts before it picks the k threshold', () => {
  // 500 kg is 1,102 lb: under the threshold in kg, over it in lb.
  assert.deepEqual(fmtVolumeShort(500, 'lb'), { value: '1.1', unit: 'k lb' });
  assert.deepEqual(fmtVolumeShort(100, 'lb'), { value: '220', unit: ' lb' });
});

test('fmtVolumeLarge scales through k and M in either unit', () => {
  assert.deepEqual(fmtVolumeLarge(218, 'kg'), { value: '218', unit: ' kg' });
  assert.deepEqual(fmtVolumeLarge(12_500, 'kg'), { value: '12.5', unit: 'k kg' });
  assert.deepEqual(fmtVolumeLarge(1_840_000, 'kg'), { value: '1.84', unit: 'M kg' });
  assert.deepEqual(fmtVolumeLarge(12_500, 'lb'), { value: '27.6', unit: 'k lb' });
  assert.deepEqual(fmtVolumeLarge(500_000, 'lb'), { value: '1.10', unit: 'M lb' });
});

test('garbage does not throw', () => {
  assert.ok(Number.isNaN(parseIso('nonsense').getTime()));
});

test('the short day reads weekday, day, month in capitals', () => {
  // Built from local parts, so it holds in any timezone.
  assert.equal(fmtShortDayUpper(new Date(2025, 8, 30, 18, 4)), 'TUE 30 SEP');
  assert.equal(fmtShortDayUpper(new Date(2026, 0, 4)), 'SUN 4 JAN');
});

test('days between local midnights count calendar days, across a clock change too', () => {
  // Every day of a year from its first: whatever the timezone, the spring and
  // autumn changes both fall inside, and neither may shift a day.
  const first = new Date(2026, 0, 1);
  for (let n = 0; n < 365; n += 1) {
    assert.equal(daysBetween(first, addDays(first, n)), n, `day ${n}`);
  }
  assert.equal(daysBetween(addDays(first, 3), first), -3);
});

test('fmtTimeOfDay: local 24-hour HH:MM', () => {
  assert.equal(fmtTimeOfDay(new Date(2026, 9, 29, 18, 2, 59).getTime()), '18:02');
  assert.equal(fmtTimeOfDay(new Date(2026, 9, 29, 7, 5).getTime()), '07:05');
});

// --- zh-Hans (#136): pinned via the trailing lang parameter ---
import { fmtAgo, fmtDateOnly, fmtMonthYear, fmtWorkoutDate, metricLabel } from './format.ts';

test('zh-Hans dates', () => {
  assert.equal(fmtHeaderDate('2026-07-08', 'zh-Hans'), '周三 · 2026年7月8日');
  assert.equal(fmtHeaderDate('2026-07-08', 'en'), 'WED · 8 JUL 2026');
  assert.equal(fmtShortDayUpper(new Date(2026, 8, 30), 'zh-Hans'), '周三 9月30日');
  assert.equal(fmtShortDayUpper(new Date(2026, 8, 30), 'en'), 'WED 30 SEP');
  assert.equal(fmtWorkoutDate('2026-07-07', 'zh-Hans'), '周二 7月7日 · 00:00');
  assert.equal(fmtWorkoutDate('2026-07-07', 'en'), 'Tue, 7 Jul · 00:00');
  assert.equal(fmtDateOnly('2026-07-07', 'zh-Hans'), '周二 2026年7月7日');
  assert.equal(fmtDateOnly('2026-07-07', 'en'), 'Tue, 7 Jul 2026');
  assert.equal(fmtMonthYear('2024-01-15', 'zh-Hans'), '2024年1月');
  assert.equal(fmtMonthYear('2024-01-15', 'en'), 'Jan 2024');
  assert.equal(fmtMonthYear(null, 'zh-Hans'), '');
});

test('zh-Hans history group titles', () => {
  const now = new Date(2026, 6, 11, 12);
  assert.equal(fmtHistoryGroupTitle('2026-07-10', now, 'en'), 'THIS WEEK');
  assert.equal(fmtHistoryGroupTitle('2026-05-02', now, 'zh-Hans'), '2026年5月');
  assert.equal(fmtHistoryGroupTitle('2026-05-02', now, 'en'), 'MAY 2026');
});

test('zh-Hans words come from the string table, English when untranslated', () => {
  const table = zh as unknown as Record<string, string>;
  const now = new Date('2026-07-11T12:00:00Z');

  // Translated: zh output is exactly the value in the string table.
  assert.equal(metricLabel('best_set', 'en'), 'Best Set');
  assert.equal(metricLabel('best_set', 'zh-Hans'), table['record.bestSet']);
  assert.equal(fmtAgo('2026-07-11T11:00:00Z', now, 'en'), '1h ago');
  assert.equal(fmtAgo('2026-07-11T11:00:00Z', now, 'zh-Hans'), table['ago.hours'].replace('{n}', '1'));

  // Untranslated: remove the keys from the imported table; zh falls back to English.
  const savedBestSet = table['record.bestSet'];
  const savedHours = table['ago.hours'];
  delete table['record.bestSet'];
  delete table['ago.hours'];
  try {
    assert.equal(metricLabel('best_set', 'zh-Hans'), 'Best Set');
    assert.equal(fmtAgo('2026-07-11T11:00:00Z', now, 'zh-Hans'), '1h ago');
  } finally {
    table['record.bestSet'] = savedBestSet;
    table['ago.hours'] = savedHours;
  }
});

import { fmtCardDay, fmtDayMonthOf, fmtLongDay, fmtMonthNames, fmtShortDay } from './format.ts';

test('edit-workout and share-card day formats, en and zh-Hans', () => {
  const d = new Date(2026, 6, 7); // Tue 7 Jul 2026
  assert.equal(fmtShortDay(d, 'en'), 'Tue 7 Jul');
  assert.equal(fmtShortDay(d, 'zh-Hans'), '周二 7月7日');
  assert.equal(fmtLongDay(d, 'en'), 'Tue, 7 Jul 2026');
  assert.equal(fmtLongDay(d, 'zh-Hans'), '周二 2026年7月7日');
  assert.equal(fmtDayMonthOf(d, 'en'), '7 Jul');
  assert.equal(fmtDayMonthOf(d, 'zh-Hans'), '7月7日');
  assert.equal(fmtCardDay(d, 'en'), '7 JUL 2026');
  assert.equal(fmtCardDay(d, 'zh-Hans'), '2026年7月7日');
  assert.equal(fmtMonthNames('en')[0], 'Jan');
  assert.equal(fmtMonthNames('en').length, 12);
  assert.deepEqual(fmtMonthNames('zh-Hans').slice(0, 2), ['1月', '2月']);
});

import { fmtImportDay, fmtWeekInitials } from './format.ts';

test('fmtWeekInitials: always seven, Monday first', () => {
  assert.deepEqual(fmtWeekInitials('en'), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.equal(fmtWeekInitials('zh-Hans').length, 7);
});

test('fmtImportDay: English is DD MON with a two-digit year only when it differs', () => {
  const newest = new Date(2026, 5, 23);
  assert.equal(fmtImportDay(new Date(2026, 8, 28), newest, 'en'), '28 SEP');
  assert.equal(fmtImportDay(new Date(2025, 7, 3), newest, 'en'), '03 AUG 25');
  assert.equal(fmtImportDay(new Date(2026, 5, 23), newest, 'zh-Hans'), '6月23日');
  assert.equal(fmtImportDay(new Date(2025, 7, 3), newest, 'zh-Hans'), '2025年8月3日');
});

// --- ru: hand-written date tables ---
test('ru dates', () => {
  const sun = new Date(2026, 10, 8); // Sun 8 Nov 2026
  const fri = new Date(2026, 4, 1); // Fri 1 May 2026
  assert.equal(fmtHeaderDate('2026-11-08', 'ru'), 'ВС · 8 НОЯБРЯ 2026');
  assert.equal(fmtHeaderDate('2026-05-01', 'ru'), 'ПТ · 1 МАЯ 2026');
  assert.equal(fmtShortDayUpper(sun, 'ru'), 'ВС 8 НОЯБРЯ');
  assert.equal(fmtShortDayUpper(fri, 'ru'), 'ПТ 1 МАЯ');
  assert.equal(fmtWorkoutDate('2026-11-08', 'ru'), 'Вс, 8 ноября · 00:00');
  assert.equal(fmtWorkoutDate('2026-05-01', 'ru'), 'Пт, 1 мая · 00:00');
  assert.equal(fmtDateOnly('2026-11-08', 'ru'), 'Вс, 8 ноября 2026');
  assert.equal(fmtDateOnly('2026-05-01', 'ru'), 'Пт, 1 мая 2026');
  assert.equal(fmtMonthYear('2026-11-08', 'ru'), 'Ноябрь 2026');
  assert.equal(fmtMonthYear('2026-05-01', 'ru'), 'Май 2026');
  assert.equal(fmtMonthYear(null, 'ru'), '');
  assert.equal(fmtShortDay(sun, 'ru'), 'Вс 8 нояб.');
  assert.equal(fmtShortDay(fri, 'ru'), 'Пт 1 мая');
  assert.equal(fmtShortDay(new Date(2026, 8, 9), 'ru'), 'Ср 9 сент.');
  assert.equal(fmtShortDay(new Date(2026, 1, 3), 'ru'), 'Вт 3 февр.');
  assert.equal(fmtLongDay(sun, 'ru'), 'Вс, 8 ноября 2026');
  assert.equal(fmtDayMonthOf(sun, 'ru'), '8 ноября');
  assert.equal(fmtDayMonthOf(fri, 'ru'), '1 мая');
  assert.equal(fmtCardDay(sun, 'ru'), '8 НОЯБРЯ 2026');
  assert.equal(fmtCardDay(fri, 'ru'), '1 МАЯ 2026');
  assert.equal(fmtImportDay(new Date(2026, 5, 23), sun, 'ru'), '23 июня');
  assert.equal(fmtImportDay(new Date(2025, 7, 3), sun, 'ru'), '3 августа 2025');
  assert.deepEqual(fmtMonthNames('ru'), ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек']);
});

test('ru history group titles', () => {
  const now = new Date(2026, 6, 11);
  assert.equal(fmtHistoryGroupTitle('2026-05-02', now, 'ru'), 'Май 2026');
  assert.equal(fmtHistoryGroupTitle('2025-11-02', now, 'ru'), 'Ноябрь 2025');
});

test('ru relative phrases come from the string table', () => {
  const now = new Date('2026-07-11T12:00:00Z');
  assert.equal(fmtAgo('2026-07-11T11:00:00Z', now, 'ru'), '1 ч назад');
});

test('fmtVolumeShort / fmtVolumeLarge: Russian decimal comma, en and zh-Hans unchanged', () => {
  assert.deepEqual(fmtVolumeShort(6800, 'kg', 'ru'), { value: '6,8', unit: 'k kg' });
  assert.deepEqual(fmtVolumeShort(850, 'kg', 'ru'), { value: '850', unit: ' kg' });
  assert.deepEqual(fmtVolumeLarge(1_840_000, 'kg', 'ru'), { value: '1,84', unit: 'M kg' });
  assert.deepEqual(fmtVolumeLarge(12_500, 'kg', 'ru'), { value: '12,5', unit: 'k kg' });
  for (const lang of ['en', 'zh-Hans'] as const) {
    assert.deepEqual(fmtVolumeShort(6800, 'kg', lang), { value: '6.8', unit: 'k kg' });
    assert.deepEqual(fmtVolumeShort(850, 'kg', lang), { value: '850', unit: ' kg' });
    assert.deepEqual(fmtVolumeLarge(1_840_000, 'kg', lang), { value: '1.84', unit: 'M kg' });
    assert.deepEqual(fmtVolumeLarge(12_500, 'kg', lang), { value: '12.5', unit: 'k kg' });
  }
});

// --- el / es: hand-written date tables, exact strings ---
test('el dates', () => {
  const tue = new Date(2026, 10, 10); // Tue 10 Nov 2026
  const fri = new Date(2026, 4, 1); // Fri 1 May 2026
  assert.equal(fmtHeaderDate('2026-11-10', 'el'), 'ΤΡΙ · 10 ΝΟΕΜΒΡΙΟΥ 2026');
  assert.equal(fmtHeaderDate('2026-05-01', 'el'), 'ΠΑΡ · 1 ΜΑΪΟΥ 2026');
  assert.equal(fmtShortDayUpper(tue, 'el'), 'ΤΡΙ 10 ΝΟΕΜΒΡΙΟΥ');
  assert.equal(fmtShortDayUpper(fri, 'el'), 'ΠΑΡ 1 ΜΑΪΟΥ');
  assert.equal(fmtWorkoutDate('2026-11-10', 'el'), 'Τρι, 10 Νοεμβρίου · 00:00');
  assert.equal(fmtWorkoutDate('2026-05-01', 'el'), 'Παρ, 1 Μαΐου · 00:00');
  assert.equal(fmtDateOnly('2026-11-10', 'el'), 'Τρι, 10 Νοεμβρίου 2026');
  assert.equal(fmtMonthYear('2026-11-10', 'el'), 'Νοέμβριος 2026');
  assert.equal(fmtMonthYear('2026-05-01', 'el'), 'Μάιος 2026');
  assert.equal(fmtMonthYear(null, 'el'), '');
  assert.equal(fmtShortDay(tue, 'el'), 'Τρι 10 Νοε');
  assert.equal(fmtShortDay(fri, 'el'), 'Παρ 1 Μάι');
  assert.equal(fmtLongDay(tue, 'el'), 'Τρι, 10 Νοεμβρίου 2026');
  assert.equal(fmtDayMonthOf(tue, 'el'), '10 Νοεμβρίου');
  assert.equal(fmtDayMonthOf(fri, 'el'), '1 Μαΐου');
  assert.equal(fmtCardDay(tue, 'el'), '10 ΝΟΕΜΒΡΙΟΥ 2026');
  assert.equal(fmtImportDay(new Date(2026, 5, 23), tue, 'el'), '23 Ιουνίου');
  assert.equal(fmtImportDay(new Date(2025, 7, 3), tue, 'el'), '3 Αυγούστου 2025');
  assert.deepEqual(fmtMonthNames('el'), ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']);
  assert.equal(fmtHistoryGroupTitle('2026-05-02', new Date(2026, 6, 11), 'el'), 'Μάιος 2026');
  assert.equal(fmtHistoryGroupTitle('2025-11-02', new Date(2026, 6, 11), 'el'), 'Νοέμβριος 2025');
  // all-caps Greek carries no tonos
  assert.doesNotMatch(fmtHeaderDate('2026-11-10', 'el'), /[άέήίόύώΆΈΉΊΌΎΏ]/u);
  assert.doesNotMatch(fmtCardDay(new Date(2026, 8, 9), 'el'), /[άέήίόύώΆΈΉΊΌΎΏ]/u);
});

test('es dates', () => {
  const tue = new Date(2026, 10, 10);
  const fri = new Date(2026, 4, 1);
  assert.equal(fmtHeaderDate('2026-11-10', 'es'), 'MAR · 10 NOV 2026');
  assert.equal(fmtHeaderDate('2026-05-01', 'es'), 'VIE · 1 MAY 2026');
  assert.equal(fmtShortDayUpper(tue, 'es'), 'MAR 10 NOV');
  assert.equal(fmtShortDayUpper(new Date(2026, 10, 15), 'es'), 'DOM 15 NOV');
  assert.equal(fmtWorkoutDate('2026-11-10', 'es'), 'mar, 10 nov · 00:00');
  assert.equal(fmtWorkoutDate('2026-05-01', 'es'), 'vie, 1 may · 00:00');
  assert.equal(fmtDateOnly('2026-11-10', 'es'), 'mar, 10 nov 2026');
  assert.equal(fmtMonthYear('2026-11-10', 'es'), 'Noviembre de 2026');
  assert.equal(fmtMonthYear('2026-05-01', 'es'), 'Mayo de 2026');
  assert.equal(fmtMonthYear(null, 'es'), '');
  assert.equal(fmtShortDay(tue, 'es'), 'mar 10 nov');
  assert.equal(fmtShortDay(new Date(2026, 10, 11), 'es'), 'mié 11 nov');
  assert.equal(fmtShortDay(new Date(2026, 10, 14), 'es'), 'sáb 14 nov');
  assert.equal(fmtLongDay(tue, 'es'), 'mar, 10 nov 2026');
  assert.equal(fmtDayMonthOf(fri, 'es'), '1 may');
  assert.equal(fmtDayMonthOf(tue, 'es'), '10 nov');
  assert.equal(fmtCardDay(tue, 'es'), '10 NOV 2026');
  assert.equal(fmtImportDay(new Date(2026, 8, 28), tue, 'es'), '28 SEP');
  assert.equal(fmtImportDay(new Date(2025, 7, 3), tue, 'es'), '03 AGO 25');
  assert.deepEqual(fmtMonthNames('es'), ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']);
  assert.equal(fmtHistoryGroupTitle('2026-05-02', new Date(2026, 6, 11), 'es'), 'Mayo de 2026');
  assert.equal(fmtHistoryGroupTitle('2025-11-02', new Date(2026, 6, 11), 'es'), 'Noviembre de 2025');
});

test('el / es volume formatters use the decimal comma', () => {
  for (const lang of ['el', 'es'] as const) {
    assert.deepEqual(fmtVolumeShort(6800, 'kg', lang), { value: '6,8', unit: 'k kg' });
    assert.deepEqual(fmtVolumeLarge(1_840_000, 'kg', lang), { value: '1,84', unit: 'M kg' });
  }
});
