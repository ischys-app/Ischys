import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseLabel, matchesSearch, groupLabel, equipmentLabel, muscleLabel, categoryLabel } from './catalogNames.ts';
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from './catalog/zh-Hans.json' with { type: 'json' };

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
