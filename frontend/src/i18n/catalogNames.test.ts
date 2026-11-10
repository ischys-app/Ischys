import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseLabel, matchesSearch, groupLabel, equipmentLabel, muscleLabel, categoryLabel } from './catalogNames.ts';
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from './catalog/zh-Hans.json' with { type: 'json' };
import el from './catalog/el.json' with { type: 'json' };
import ru from './catalog/ru.json' with { type: 'json' };

const ex = catalog.exercises[0];
const mutable = zh as unknown as { exercises: Record<string, string>; groups: Record<string, string> };

test('exerciseLabel rules', () => {
  const saved = mutable.exercises[ex.id];
  mutable.exercises[ex.id] = '测试动作';
  try {
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 0 }, 'zh-Hans'), '测试动作');
    assert.equal(exerciseLabel({ id: ex.id, name: 'My rename' }, 'zh-Hans'), 'My rename');
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 1 }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: true }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: 'nope', name: ex.name }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'en'), ex.name);
  } finally {
    if (saved === undefined) delete mutable.exercises[ex.id];
    else mutable.exercises[ex.id] = saved;
  }
  assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'zh-Hans'), saved ?? ex.name);
});

test('muscle, category and equipment return the real translations', () => {
  const m = catalog.muscles[0];
  const c = catalog.categories[0];
  const real = zh as unknown as { muscles: Record<string, string>; categories: Record<string, string>; equipment: Record<string, string> };
  assert.equal(muscleLabel(m, 'zh-Hans'), real.muscles[m.id]);
  assert.notEqual(real.muscles[m.id], undefined);
  assert.equal(muscleLabel(m, 'en'), m.name);
  assert.equal(muscleLabel({ id: m.id, name: 'Renamed' }, 'zh-Hans'), 'Renamed');
  assert.equal(categoryLabel(c, 'zh-Hans'), real.categories[c.id]);
  assert.notEqual(real.categories[c.id], undefined);
  assert.equal(categoryLabel(c, 'en'), c.name);
  assert.equal(equipmentLabel('barbell', 'zh-Hans'), real.equipment.barbell);
  assert.notEqual(real.equipment.barbell, undefined);
  assert.notEqual(real.equipment.barbell, 'barbell');
});

test('group and equipment fall back to the stored value', () => {
  assert.equal(equipmentLabel('Unknown gear', 'zh-Hans'), 'Unknown gear');
  const saved = mutable.groups.Core;
  mutable.groups.Core = '核心';
  try {
    assert.equal(groupLabel('Core', 'zh-Hans'), '核心');
    assert.equal(groupLabel('Core', 'en'), 'Core');
  } finally {
    if (saved === undefined) delete mutable.groups.Core;
    else mutable.groups.Core = saved;
  }
});

test('matchesSearch is bilingual, case and accent insensitive', () => {
  assert.equal(matchesSearch('bench', ['卧推', 'Bench Press']), true);
  assert.equal(matchesSearch('卧', ['卧推', 'Bench Press']), true);
  assert.equal(matchesSearch('深蹲', ['深蹲']), true);
  assert.equal(matchesSearch('cafe', ['Café']), true);
  assert.equal(matchesSearch('squat', ['卧推', 'Bench Press']), false);
  assert.equal(matchesSearch('  ', ['x']), true);
});

test('ru catalog: translated for catalog exercises, stored for renamed and custom', () => {
  const table = ru as unknown as { exercises: Record<string, string> };
  table.exercises[ex.id] = 'Тестовое упражнение';
  try {
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'ru'), 'Тестовое упражнение');
    assert.equal(exerciseLabel({ id: ex.id, name: 'My rename' }, 'ru'), 'My rename');
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 1 }, 'ru'), ex.name);
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'zh-Hans') === 'Тестовое упражнение', false);
  } finally {
    delete table.exercises[ex.id];
  }
  assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'ru'), ex.name);
});

test('search folds ё and case for Russian', () => {
  assert.equal(matchesSearch('ёлочка', ['Елочка']), true);
  assert.equal(matchesSearch('ЖИМ', ['Жим лёжа']), true);
});

test('el: exerciseLabel returns the Greek name; custom keeps its stored name', () => {
  const m = el as unknown as { exercises: Record<string, string> };
  m.exercises[ex.id] = 'Δοκιμή';
  try {
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 0 }, 'el'), 'Δοκιμή');
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 1 }, 'el'), ex.name);
  } finally {
    delete m.exercises[ex.id];
  }
});

test('search folds accents and final sigma for Spanish and Greek', () => {
  assert.equal(matchesSearch('press banca', ['Press de banca']), false);
  assert.equal(matchesSearch('press de banca', ['Press de Banca']), true);
  assert.equal(matchesSearch('pesa', ['Pésa']), true);
  assert.equal(matchesSearch('ασκηση', ['Άσκηση']), true);
  assert.equal(matchesSearch('σ', ['ς']), true);
  assert.equal(matchesSearch('ΣΩΜΑΤΟΣ', ['σώματος']), true);
});
