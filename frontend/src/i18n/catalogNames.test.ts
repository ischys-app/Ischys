import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exerciseLabel, matchesSearch, groupLabel, equipmentLabel } from './catalogNames.ts';
import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from './catalog/zh-Hans.json' with { type: 'json' };

const ex = catalog.exercises[0];
const mutable = zh as unknown as { exercises: Record<string, string>; groups: Record<string, string> };

test('exerciseLabel rules', () => {
  mutable.exercises[ex.id] = '测试动作';
  try {
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 0 }, 'zh-Hans'), '测试动作');
    assert.equal(exerciseLabel({ id: ex.id, name: 'My rename' }, 'zh-Hans'), 'My rename');
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: 1 }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name, isCustom: true }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: 'nope', name: ex.name }, 'zh-Hans'), ex.name);
    assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'en'), ex.name);
  } finally {
    delete mutable.exercises[ex.id];
  }
  assert.equal(exerciseLabel({ id: ex.id, name: ex.name }, 'zh-Hans'), ex.name);
});

test('group and equipment fall back to the stored value', () => {
  assert.equal(equipmentLabel('Barbell', 'zh-Hans'), 'Barbell');
  mutable.groups.Core = '核心';
  try {
    assert.equal(groupLabel('Core', 'zh-Hans'), '核心');
    assert.equal(groupLabel('Core', 'en'), 'Core');
  } finally {
    delete mutable.groups.Core;
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
