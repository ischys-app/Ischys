/** Run with: npm test */
const assert = require('node:assert/strict');
const { test } = require('node:test');

let core;
test.before(async () => {
  core = await import('./core.mjs');
});

const item = (key, en, note = 'note') => ({ key, en, note });

test('hashEn is stable and distinguishes inputs', () => {
  assert.equal(core.hashEn('Sets'), core.hashEn('Sets'));
  assert.notEqual(core.hashEn('Sets'), core.hashEn('Sets '));
  assert.match(core.hashEn('x'), /^[0-9a-f]{16}$/);
});

test('needsTranslation covers new, unchanged, changed, manual, flagged', () => {
  const h = (s) => core.hashEn(s);
  const state = {
    ok: { enHash: h('A'), status: 'ok' },
    pend: { enHash: h('A'), status: 'pending' },
    man: { enHash: h('A'), status: 'manual' },
    flag: { enHash: h('A'), status: 'flagged', reason: 'x' },
  };
  const n = (k, en, o = { retryFlagged: false }) => core.needsTranslation(k, en, state, o);
  assert.equal(n('new', 'A'), true);
  assert.equal(n('ok', 'A'), false);
  assert.equal(n('ok', 'B'), true);
  assert.equal(n('pend', 'A'), false);
  assert.equal(n('man', 'A'), false);
  assert.equal(n('man', 'B'), true);
  assert.equal(n('flag', 'A'), false);
  assert.equal(n('flag', 'A', { retryFlagged: true }), true);
  assert.equal(n('flag', 'B'), true);
});

test('buildPrompt includes every glossary row and every note', () => {
  const glossary = {
    terms: [
      { en: 'set', zh: '组' },
      { en: 'rest', zh: '休息', extension: true },
    ],
    untranslated: ['RPE', 'Ischys'],
  };
  const batch = [item('a', 'Start', 'Button on the home screen.'), item('b', 'Stop', 'Another unique note.')];
  const { system, user } = core.buildPrompt(batch, glossary);
  for (const w of ['set', '组', 'rest', '休息', 'RPE', 'Ischys']) assert.ok(system.includes(w), w);
  assert.ok(/json/i.test(system));
  for (const b of batch) {
    assert.ok(user.includes(b.key));
    assert.ok(user.includes(b.en));
    assert.ok(user.includes(b.note));
  }
});

test('parseResponse accepts good output and ignores unexpected keys', () => {
  const batch = [item('a', 'Start {name}'), item('b', 'Stop')];
  const r = core.parseResponse(JSON.stringify({ a: '开始 {name}', b: '停止', zzz: 'x' }), batch);
  assert.deepEqual(r.ok, { a: '开始 {name}', b: '停止' });
  assert.deepEqual(r.rejected, {});
});

test('parseResponse rejects placeholder mismatch, empty, missing, bad json', () => {
  const batch = [item('a', '{n} sets'), item('b', 'Stop'), item('c', 'Go')];
  const r = core.parseResponse(JSON.stringify({ a: '组', b: '  ' }), batch);
  assert.ok(r.rejected.a);
  assert.ok(r.rejected.b);
  assert.ok(r.rejected.c);
  assert.deepEqual(r.ok, {});
  const extra = core.parseResponse(JSON.stringify({ a: '{n} {m} 组', b: '停', c: '走' }), batch);
  assert.ok(extra.rejected.a);
  const bad = core.parseResponse('not json', batch);
  assert.equal(Object.keys(bad.rejected).length, 3);
  const nonString = core.parseResponse(JSON.stringify({ a: 5, b: '停', c: '走' }), batch);
  assert.ok(nonString.rejected.a);
});

test('parseResponse rejects overlong only when the note states a max', () => {
  const capped = item('a', 'Home', 'Tab label. Max 2 characters; fixed-width.');
  const single = item('s', 'X', 'Glyph. Max 1 character.');
  const free = item('b', 'Home page title', 'Screen title.');
  const r = core.parseResponse(JSON.stringify({ a: '主页面', b: '这是一个非常非常长的页面标题文字', s: '好' }), [capped, free, single]);
  assert.ok(r.rejected.a);
  assert.equal(r.ok.b, '这是一个非常非常长的页面标题文字');
  assert.equal(r.ok.s, '好');
  assert.equal(core.parseResponse(JSON.stringify({ a: '主页' }), [capped]).ok.a, '主页');
  assert.equal(core.maxLength('Max 8 characters'), 8);
  assert.equal(core.maxLength('Max 1 character.'), 1);
  assert.equal(core.maxLength('no limit'), null);
});

test('Latin-only output is rejected for translatable English', () => {
  const r = core.parseResponse(JSON.stringify({ a: 'Start', b: 'Ab Roller' }), [item('a', 'Start'), item('b', 'Ab Roller')]);
  assert.ok(r.rejected.a);
  assert.ok(r.rejected.b);
});

test('Latin-only output is allowed when English is only untranslatable tokens', () => {
  const batch = [
    item('a', 'RPE'),
    item('b', '1RM'),
    item('c', 'PR'),
    item('d', 'kg'),
    item('e', 'lb'),
    item('f', 'Ischys'),
    item('g', 'W'),
    item('h', '{count}'),
    item('i', '60'),
    item('j', '{n} kg'),
    item('k', 'RPE 8'),
  ];
  const out = Object.fromEntries(batch.map((b) => [b.key, b.en]));
  const r = core.parseResponse(JSON.stringify(out), batch);
  assert.deepEqual(r.rejected, {});
});

test('mixed output keeping untranslatable tokens is allowed', () => {
  const batch = [item('a', 'Est. 1RM'), item('b', 'Ischys Pro Plan'), item('c', 'Weight in kg')];
  const r = core.parseResponse(JSON.stringify({ a: '预估 1RM', b: 'Ischys 专业计划', c: '重量（kg）' }), batch);
  assert.deepEqual(r.rejected, {});
});

function fakeTargets(init) {
  const m = { ...init };
  return { m, get: (k) => m[k], del: (k) => { delete m[k]; } };
}

test('maxLength is case-insensitive', () => {
  assert.equal(core.maxLength('tab label, max 36 characters'), 36);
});

test('applyReview: ok marks ok, flagged deletes zh and keeps reason', () => {
  const h = core.hashEn('A');
  const state = { a: { enHash: h, status: 'pending' }, b: { enHash: h, status: 'pending' } };
  const t = fakeTargets({ a: '甲', b: '乙' });
  const r = core.applyReview(
    [
      { key: 'a', status: 'ok', zh: '甲', enHash: h },
      { key: 'b', status: 'flagged', reason: 'slang', zh: '乙', enHash: h },
    ],
    state,
    t,
  );
  assert.equal(state.a.status, 'ok');
  assert.equal(state.a.zhHash, core.hashEn('甲'));
  assert.equal(state.b.zhHash, undefined);
  assert.equal(state.b.status, 'flagged');
  assert.equal(state.b.reason, 'slang');
  assert.equal(t.m.b, undefined);
  assert.equal(t.m.a, '甲');
  assert.deepEqual([r.ok, r.flagged, r.refused.length], [1, 1, 0]);
});

test('applyReview refuses stale entries', () => {
  const h = core.hashEn('A');
  const state = { a: { enHash: h, status: 'pending' }, b: { enHash: h, status: 'pending' }, c: { enHash: h, status: 'ok' } };
  const t = fakeTargets({ a: '新', b: '乙', c: '丙' });
  const r = core.applyReview(
    [
      { key: 'a', status: 'flagged', zh: '旧', enHash: h },
      { key: 'b', status: 'ok', zh: '乙', enHash: 'other' },
      { key: 'c', status: 'flagged', zh: '丙', enHash: h },
      { key: 'zz', status: 'ok', zh: 'x', enHash: h },
    ],
    state,
    t,
  );
  assert.equal(r.refused.length, 4);
  assert.equal(state.a.status, 'pending');
  assert.equal(t.m.a, '新');
  assert.equal(state.c.status, 'ok');
  assert.equal(t.m.c, '丙');
});

test('applyReview throws on unknown status before changing anything', () => {
  const h = core.hashEn('A');
  const state = { a: { enHash: h, status: 'pending' }, b: { enHash: h, status: 'pending' } };
  const t = fakeTargets({ a: '甲', b: '乙' });
  assert.throws(
    () => core.applyReview([{ key: 'a', status: 'ok', zh: '甲', enHash: h }, { key: 'b', status: 'maybe', zh: '乙', enHash: h }], state, t),
    /unknown review status/,
  );
  assert.equal(state.a.status, 'pending');
});

test('applyReview never touches manual entries', () => {
  const h = core.hashEn('A');
  const state = { a: { enHash: h, status: 'manual' } };
  const t = fakeTargets({ a: '甲' });
  const r = core.applyReview([{ key: 'a', status: 'flagged', reason: 'x', zh: '甲', enHash: h }], state, t);
  assert.equal(r.refused.length, 1);
  assert.equal(state.a.status, 'manual');
  assert.equal(t.m.a, '甲');
});

test('invalidateStale removes zh and state only where English changed', () => {
  const state = {
    a: { enHash: core.hashEn('old'), status: 'ok' },
    b: { enHash: core.hashEn('same'), status: 'ok' },
    m: { enHash: core.hashEn('old'), status: 'manual' },
  };
  const t = fakeTargets({ a: '旧', b: '同', m: '手' });
  const gone = core.invalidateStale(
    [item('a', 'new'), item('b', 'same'), item('m', 'new'), item('fresh', 'x')],
    state,
    t,
  );
  assert.deepEqual(gone.sort(), ['a', 'm']);
  assert.deepEqual(t.m, { b: '同' });
  assert.deepEqual(Object.keys(state), ['b']);
});

// ---- Russian ----

let LANGS;
let denylist;
test.before(async () => {
  ({ LANGS } = await import('./langs.mjs'));
  denylist = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, 'denylist.ru.json'), 'utf8'));
});

const pairItem = {
  key: 'ui:home.sets_other',
  en: '{count} sets',
  note: 'Count on the card.',
  plural: { base: 'ui:home.sets', one: '{count} set', var: 'count' },
};
const tagItem = { key: 'ui:rest.left', en: '{n} reps left', note: 'Banner.', plural: { base: 'ui:rest.left', var: 'n' } };

test('LANGS: zh-Hans keeps today\'s values, ru has its own', () => {
  const zh = LANGS['zh-Hans'];
  assert.equal(zh.lengthFactor, 1);
  assert.equal(zh.plural, 'none');
  assert.equal(String(zh.scriptRegex), String(/[㐀-鿿豈-﫿]/));
  assert.equal(zh.files.state, 'src/i18n/zh-Hans.state.json');
  const ru = LANGS.ru;
  assert.equal(ru.promptLanguage, 'Russian');
  assert.equal(ru.lengthFactor, 1.35);
  assert.equal(ru.plural, 'ru');
  assert.ok(ru.scriptRegex.test('Жим'));
  assert.equal(ru.files.review, '.i18n-review/ru.review.json');
});

test('expandPlurals: ru pair key becomes four forms with the right English', () => {
  const out = core.expandPlurals([pairItem, item('ui:plain', 'Start')], LANGS.ru);
  assert.deepEqual(out.map((i) => i.key), ['ui:home.sets_one', 'ui:home.sets_few', 'ui:home.sets_many', 'ui:home.sets_other', 'ui:plain']);
  assert.deepEqual(out.map((i) => i.en), ['{count} set', '{count} sets', '{count} sets', '{count} sets', 'Start']);
  assert.ok(out[0].note.startsWith('Count on the card.'));
  assert.ok(out[0].note.includes('Russian plural form "one": used for counts like 1, 21, 101'));
  assert.ok(out[1].note.includes('Russian plural form "few": used for counts like 2, 3, 4, 22'));
  assert.ok(out[2].note.includes('Russian plural form "many": used for counts like 0, 5, 11, 25'));
  assert.ok(out[3].note.includes('Russian plural form "other": used for counts like 1.5'));
  assert.equal(out[4].note, 'note');
});

test('expandPlurals: ru plural-tagged key uses the single form for all four', () => {
  const out = core.expandPlurals([tagItem], LANGS.ru);
  assert.deepEqual(out.map((i) => i.key), ['ui:rest.left_one', 'ui:rest.left_few', 'ui:rest.left_many', 'ui:rest.left_other']);
  assert.ok(out.every((i) => i.en === '{n} reps left'));
  assert.ok(out[0].note.includes('"one"'));
});

test('expandPlurals: zh-Hans is the identity', () => {
  const items = [pairItem, tagItem, item('ui:plain', 'Start')];
  assert.deepEqual(core.expandPlurals(items, LANGS['zh-Hans']), items);
});

test('ru checks: Latin-only rejected, Cyrillic accepted', () => {
  const ru = LANGS.ru;
  assert.equal(core.checkOne(item('a', 'Bench Press'), 'Bench Press', ['RPE'], ru), 'no Russian characters in output');
  assert.equal(core.checkOne(item('a', 'Bench Press'), 'Жим лёжа', ['RPE'], ru), null);
  const r = core.parseResponse(JSON.stringify({ a: 'Start', b: 'Жим лёжа', c: 'RPE' }), [item('a', 'Start'), item('b', 'Bench Press'), item('c', 'RPE')], { lang: ru });
  assert.equal(r.rejected.a, 'no Russian characters in output');
  assert.deepEqual(r.ok, { b: 'Жим лёжа', c: 'RPE' });
});

test('overlong budget scales by lengthFactor: 20 -> 27 for ru, 20 for zh', () => {
  const capped = item('a', 'Some label', 'Label. Max 20 characters.');
  const ok27 = 'а'.repeat(27);
  const bad28 = 'а'.repeat(28);
  assert.equal(core.checkOne(capped, ok27, [], LANGS.ru), null);
  assert.equal(core.checkOne(capped, bad28, [], LANGS.ru), 'overlong (max 27)');
  assert.equal(core.checkOne(capped, '字'.repeat(21), [], LANGS['zh-Hans']), 'overlong (max 20)');
  assert.equal(core.checkOne(capped, '字'.repeat(20), [], LANGS['zh-Hans']), null);
});

test('buildPrompt for ru: Russian, вы, glossary, no-agreement rule', () => {
  const glossary = { terms: [{ en: 'set', ru: 'подход' }], untranslated: ['RPE', 'Ischys'] };
  const { system, user } = core.buildPrompt([item('a', 'Start', 'Button.')], glossary, LANGS.ru);
  for (const w of ['Russian', 'вы', 'ты', 'set', 'подход', 'RPE', 'Ischys', 'Подходы: {n}']) assert.ok(system.includes(w), w);
  assert.ok(!system.includes('Chinese'));
  assert.ok(user.includes('Button.'));
});

test('buildPrompt for zh is unchanged with or without the lang', () => {
  const glossary = { terms: [{ en: 'set', zh: '组' }], untranslated: ['RPE'] };
  const batch = [item('a', 'Start', 'Button.')];
  assert.deepEqual(core.buildPrompt(batch, glossary, LANGS['zh-Hans']), core.buildPrompt(batch, glossary));
  assert.ok(core.buildPrompt(batch, glossary).system.startsWith('You translate UI strings for a gym workout-tracking mobile app from English into Simplified Chinese for mainland China.'));
});

test('denyHits: stems flagged only when the English lacks them', () => {
  assert.deepEqual(core.denyHits('Русские скручивания', 'Russian Twist', denylist), []);
  assert.deepEqual(core.denyHits('Советский жим', 'Arnold Press', denylist), ['советск']);
  assert.deepEqual(core.denyHits('Армейский жим', 'Military Press', denylist), []);
  assert.deepEqual(core.denyHits('Армейский жим', 'Overhead Press', denylist), []);
  assert.deepEqual(core.denyHits('Двойной подход', 'Double set', denylist), []);
  assert.deepEqual(core.denyHits('Гимнастика', 'Gymnastics', denylist), []);
  assert.deepEqual(core.denyHits('Страница истории', 'History page', denylist), []);
  assert.deepEqual(core.denyHits('Военный жим', 'Shoulder Press', denylist), ['военн']);
  assert.deepEqual(core.denyHits('Флаг России', 'Settings', denylist).sort(), ['росси', 'флаг']);
});

test('applyReview (ru): denyHits entry needs denyCleared to be ok', () => {
  const h = core.hashEn('Arnold Press');
  const mk = () => ({ a: { enHash: h, status: 'pending' }, b: { enHash: h, status: 'pending' }, c: { enHash: h, status: 'pending' } });
  const state = mk();
  const t = fakeTargets({ a: 'Советский жим', b: 'Советский жим', c: 'Советский жим' });
  const opts = { lang: LANGS.ru, denylist };
  const r = core.applyReview(
    [
      { key: 'a', status: 'ok', en: 'Arnold Press', ru: 'Советский жим', enHash: h, denyHits: ['советск'] },
      { key: 'b', status: 'ok', en: 'Arnold Press', ru: 'Советский жим', enHash: h, denyHits: ['советск'], denyCleared: true },
      // denyHits deleted by hand: recomputed from the denylist, still refused
      { key: 'c', status: 'ok', en: 'Arnold Press', ru: 'Советский жим', enHash: h },
    ],
    state,
    t,
    opts,
  );
  assert.deepEqual(r.refused.map((x) => x.key), ['a', 'c']);
  assert.match(r.refused[0].reason, /denyCleared/);
  assert.equal(state.a.status, 'pending');
  assert.equal(state.b.status, 'ok');
  assert.equal(state.b.ruHash, core.hashEn('Советский жим'));
  assert.equal(state.b.zhHash, undefined);
  // flagging a denyHits entry is always allowed
  const s2 = mk();
  const t2 = fakeTargets({ a: 'Советский жим' });
  const r2 = core.applyReview([{ key: 'a', status: 'flagged', reason: 'political', en: 'Arnold Press', ru: 'Советский жим', enHash: h, denyHits: ['советск'] }], s2, t2, opts);
  assert.equal(r2.flagged, 1);
  assert.equal(t2.m.a, undefined);
});

test('applyReview (ru): reads the ru field, refuses when English does not match', () => {
  const h = core.hashEn('Start');
  const state = { a: { enHash: h, status: 'pending' }, b: { enHash: h, status: 'pending' } };
  const t = fakeTargets({ a: 'Начать', b: 'Начать' });
  const r = core.applyReview(
    [
      { key: 'a', status: 'ok', en: 'Start', ru: 'Начать', enHash: h },
      { key: 'b', status: 'ok', en: 'Stop', ru: 'Начать', enHash: h },
    ],
    state,
    t,
    { lang: LANGS.ru, denylist },
  );
  assert.equal(state.a.status, 'ok');
  assert.deepEqual(r.refused.map((x) => x.key), ['b']);
});

test('denyHits: common UI words are not false positives; Z/V only as whole words', () => {
  for (const s of ['Свой вес', 'Свободный вес', 'Думаете?', 'Грузить данные', 'Версия v1.2', 'Zoom', 'Фронтальный подъём', 'Странно', 'Выбрать упражнение', 'Победа над рекордом']) {
    assert.deepEqual(core.denyHits(s, 'Something', denylist), [], s);
  }
  assert.deepEqual(core.denyHits('Жим Z', 'Press', denylist), ['z']);
  assert.deepEqual(core.denyHits('Грузия', 'Press', denylist), ['грузи']);
});

test('collectSources + expandPlurals (ru) produce the keys the runtime translator reads', async () => {
  const { collectSources } = await import('./sources.mjs');
  const { strings } = await import('../../src/i18n/strings/en.ts');
  const items = await collectSources(require('node:path').join(__dirname, '..', '..'));
  const zh = core.expandPlurals(items, LANGS['zh-Hans']);
  assert.equal(zh, items);
  assert.ok(items.some((i) => i.key === 'ui:workout.doneStat_other'));
  assert.ok(!items.some((i) => i.key === 'ui:workout.doneStat_one'));
  const ru = new Map(core.expandPlurals(items, LANGS.ru).map((i) => [i.key, i.en]));
  for (const cat of ['one', 'few', 'many', 'other']) {
    assert.equal(ru.get(`ui:effort.nReps_${cat}`), strings['effort.nReps'].en);
    assert.equal(ru.get(`ui:workout.doneStat_${cat}`), strings[cat === 'one' ? 'workout.doneStat_one' : 'workout.doneStat_other'].en);
  }
  assert.ok(!ru.has('ui:effort.nReps'));
  // every pair and every plural-tagged key expands to exactly four forms
  const bases = Object.keys(strings).filter((k) => strings[k].plural !== undefined || k.endsWith('_other'));
  for (const k of bases) {
    const base = k.endsWith('_other') ? k.slice(0, -6) : k;
    for (const cat of ['one', 'few', 'many', 'other']) assert.ok(ru.has(`ui:${base}_${cat}`), `${base}_${cat}`);
  }
});

test('denyHits: all «стран-» endings, slurs, ZOV and гойда are flagged; «странно», «жидкость» are not', () => {
  for (const s of ['По странам', 'Выберите страну', 'Между странами', 'В странах', 'Страновой код', 'Этой страной']) {
    assert.ok(core.denyHits(s, 'Something', denylist).length > 0, s);
  }
  for (const s of ['Странно', 'Странный вес', 'Жидкость']) {
    assert.deepEqual(core.denyHits(s, 'Something', denylist), [], s);
  }
  for (const [s, stem] of [['Москаль', 'москал'], ['Хохлы', 'хохл'], ['кацап', 'кацап'], ['Жиды', 'жид'], ['Пиндосы', 'пиндос'], ['Укропы', 'укроп'], ['Бандеровцы', 'бандер'], ['Чурка', 'чурк'], ['Хачи', 'хач'], ['ZOV', 'zov'], ['Гойда', 'гойд']]) {
    assert.deepEqual(core.denyHits(s, 'Press', denylist), [stem], s);
  }
});

test('parseResponse (ru, keepEdgeSpace): stored value carries the English edge whitespace exactly', () => {
  const batch = [item('a', ' into {name}'), item('b', ' workout, '), item('c', '{routine} has been running for '), item('d', 'Start'), item('e', '\n  Done')];
  const r = core.parseResponse(JSON.stringify({ a: 'в {name}', b: '  тренировку,', c: '{routine} идёт уже', d: ' Начать ', e: 'Готово' }), batch, { lang: LANGS.ru });
  assert.deepEqual(r.rejected, {});
  assert.deepEqual(r.ok, { a: ' в {name}', b: ' тренировку, ', c: '{routine} идёт уже ', d: 'Начать', e: '\n  Готово' });
  assert.equal(LANGS.ru.keepEdgeSpace, true);
});

test('parseResponse (zh): edge whitespace still trimmed as before', () => {
  const r = core.parseResponse(JSON.stringify({ a: ' 到 {name} ' }), [item('a', ' into {name}')]);
  assert.deepEqual(r.ok, { a: '到 {name}' });
  assert.ok(!LANGS['zh-Hans'].keepEdgeSpace);
});

test('withRetryReason appends the review reason only for a flagged entry with a reason', () => {
  const it = item('a', 'Start', 'Button.');
  const flagged = { enHash: core.hashEn('Start'), status: 'flagged', reason: 'political word' };
  const out = core.withRetryReason(it, flagged);
  assert.equal(out.note, 'Button. A previous translation was rejected by review: political word. Avoid that problem.');
  assert.equal(out.en, it.en);
  assert.equal(out.key, it.key);
  assert.equal(it.note, 'Button.');
  assert.equal(core.withRetryReason(it, { ...flagged, reason: '' }), it);
  assert.equal(core.withRetryReason(it, { ...flagged, status: 'pending' }), it);
  assert.equal(core.withRetryReason(it, undefined), it);
  assert.equal(core.withRetryReason({ key: 'b', en: 'x' }, flagged).note, 'A previous translation was rejected by review: political word. Avoid that problem.');
  // the note does not change what the translation answers
  assert.equal(core.needsTranslation('a', out.en, { a: flagged }, { retryFlagged: true }), true);
});

// ---- Greek and Spanish ----

const readDeny = (code) => JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, `denylist.${code}.json`), 'utf8'));

test('LANGS: el and es configuration', () => {
  for (const [code, name] of [['el', 'Greek'], ['es', 'Spanish']]) {
    const l = LANGS[code];
    assert.equal(l.field, code);
    assert.equal(l.promptLanguage, name);
    assert.equal(l.lengthFactor, 1.35);
    assert.equal(l.plural, 'one-other');
    assert.equal(l.keepEdgeSpace, true);
    assert.equal(l.files.plist, undefined);
    assert.equal(l.files.state, `src/i18n/${code}.state.json`);
    assert.equal(l.files.denylist, `scripts/i18n/denylist.${code}.json`);
    assert.equal(l.files.glossary, `scripts/i18n/glossary.${code}.json`);
  }
  assert.ok(LANGS.el.scriptRegex.test('Άσκηση'));
  assert.ok(LANGS.es.scriptRegex.test('Sentadilla'));
});

test('expandPlurals: el and es give _one and _other with the right English', () => {
  for (const code of ['el', 'es']) {
    const out = core.expandPlurals([pairItem, tagItem, item('ui:plain', 'Start')], LANGS[code]);
    assert.deepEqual(out.map((i) => i.key), ['ui:home.sets_one', 'ui:home.sets_other', 'ui:rest.left_one', 'ui:rest.left_other', 'ui:plain']);
    assert.deepEqual(out.map((i) => i.en), ['{count} set', '{count} sets', '{n} reps left', '{n} reps left', 'Start']);
    assert.ok(out[0].note.startsWith('Count on the card.'));
    assert.ok(out[0].note.includes('"one"') && out[0].note.includes('counts like 1'));
    assert.ok(out[1].note.includes('"other"') && out[1].note.includes('0, 2, 5, 1.5'));
    assert.equal(out[4].note, 'note');
  }
});

test('expandPlurals: zh and ru unchanged by the one-other path', () => {
  assert.equal(core.expandPlurals([pairItem], LANGS.ru).length, 4);
  assert.deepEqual(core.expandPlurals([pairItem], LANGS['zh-Hans']), [pairItem]);
});

test('el checks: Latin-only rejected, Greek accepted', () => {
  const el = LANGS.el;
  assert.equal(core.checkOne(item('a', 'Bench Press'), 'Bench Press', ['RPE'], el), 'no Greek characters in output');
  assert.equal(core.checkOne(item('a', 'Exercise'), 'Άσκηση', ['RPE'], el), null);
});

test('buildPrompt for el and es', () => {
  const g = { terms: [{ en: 'set', el: 'σετ', es: 'serie' }], untranslated: ['RPE', 'Ischys'] };
  const batch = [item('a', 'Start', 'Button.')];
  const el = core.buildPrompt(batch, g, LANGS.el).system;
  for (const w of ['Greek', 'εσύ', 'no tonos', 'ALL-CAPS', 'σετ', 'RPE', 'Ischys']) assert.ok(el.includes(w), w);
  assert.ok(!el.includes('Chinese') && !el.includes('Russian'));
  const es = core.buildPrompt(batch, g, LANGS.es).system;
  for (const w of ['Spanish', 'tú', 'Latin America', 'serie', 'mandatory']) assert.ok(es.includes(w), w);
  assert.ok(!es.includes('Greek'));
  assert.ok(core.buildPrompt(batch, g, LANGS.es).user.includes('Button.'));
});

test('el all-caps normalisation drops the tonos when the English is all caps', () => {
  const batch = [item('a', 'THIS WEEK'), item('b', 'This week'), item('c', '{count} SETS')];
  const r = core.parseResponse(JSON.stringify({ a: 'ΑΥΤΉ ΤΗΝ ΕΒΔΟΜΆΔΑ', b: 'Αυτή την εβδομάδα', c: '{count} ΣΈΤ' }), batch, { lang: LANGS.el });
  assert.deepEqual(r.ok, { a: 'ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ', b: 'Αυτή την εβδομάδα', c: '{count} ΣΕΤ' });
  assert.equal(core.normalizeOutput('THIS WEEK', 'αυτή την εβδομάδα', LANGS.el), 'ΑΥΤΗ ΤΗΝ ΕΒΔΟΜΑΔΑ');
  assert.equal(core.normalizeOutput('THIS WEEK', 'This week', LANGS.es), 'This week');
});

test('es denyHits: Military Press as "press militar" is allowed', () => {
  assert.deepEqual(core.denyHits('Press militar', 'Military Press', readDeny('es')), []);
  assert.deepEqual(core.denyHits('Press militar', 'Overhead Press', readDeny('es')), []);
  assert.deepEqual(core.denyHits('Bandera de España', 'Settings', readDeny('es')).sort(), ['bander', 'españ']);
  assert.deepEqual(core.denyHits('Ελληνική σημαία', 'Settings', readDeny('el')).length > 0, true);
  assert.deepEqual(core.denyHits('Στρατιωτικό πρες', 'Military Press', readDeny('el')), []);
  assert.deepEqual(core.denyHits('Στρατιωτικό πρες', 'Shoulder Press', readDeny('el')), ['στρατιωτ']);
});

test('denyHits: Spanish and Greek reviewer fixes', () => {
  const es = readDeny('es');
  const el = readDeny('el');
  assert.ok(core.denyHits('Coge la barra', 'Grab the bar', es).includes('coge'));
  assert.deepEqual(core.denyHits('Recoge la barra', 'Grab the bar', es), []);
  assert.deepEqual(core.denyHits('a tu elección', 'your choice', es), []);
  assert.deepEqual(core.denyHits('Press de banca turquesa', 'Bench', es), []);
  assert.deepEqual(core.denyHits('Movilización articular', 'Joint mobility', es), []);
  assert.deepEqual(core.denyHits('Franco y francamente', 'Frank', es), []);
  assert.ok(core.denyHits('Eres un maricón', 'Press', es).length > 0);
  assert.deepEqual(core.denyHits('Πίεσε μαλακά', 'Press gently', el), []);
  assert.deepEqual(core.denyHits('Σκοπός', 'Goal', el), []);
  assert.deepEqual(core.denyHits('Σκόπια', 'Goal', el), ['σκοπια']);
});
