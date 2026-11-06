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
