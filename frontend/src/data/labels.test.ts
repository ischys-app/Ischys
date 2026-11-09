/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import catalog from '../../assets/catalog/catalog.json' with { type: 'json' };
import zh from '../i18n/catalog/zh-Hans.json' with { type: 'json' };
import { nameToStore } from '../i18n/catalogNames.ts';
import { toCategoryOut, toExerciseOut, toMuscleOut, type ExerciseRow } from './map.ts';
import { filterExercises, indexLetter, muscleTag, sortByName } from './labels.ts';

type Dict = Record<string, string>;
const mutable = zh as unknown as {
  exercises: Dict;
  muscles: Dict;
  categories: Dict;
  groups: Dict;
  equipment: Dict;
};

const bench = catalog.exercises.find((e) => e.name === 'Barbell Bench Press - Medium Grip')!;
const squat = catalog.exercises.find((e) => e.name === 'Barbell Squat')!;
const chest = catalog.muscles.find((m) => m.name === 'Chest')!;
const quads = catalog.muscles.find((m) => m.name === 'Quads')!;
const chestCat = catalog.categories.find((c) => c.name === 'Chest')!;
const legsCat = catalog.categories.find((c) => c.name === 'Legs')!;

/** Fill a few zh labels for the duration of `fn` (the shipped table is still empty). */
function withZh(fn: () => void): void {
  mutable.exercises[bench.id] = '卧推';
  mutable.exercises[squat.id] = '深蹲';
  mutable.muscles[chest.id] = '胸';
  mutable.muscles[quads.id] = '股四头肌';
  mutable.categories[chestCat.id] = '胸部';
  mutable.categories[legsCat.id] = '腿部';
  mutable.groups.Chest = '胸部';
  mutable.groups.Other = '其他';
  try {
    fn();
  } finally {
    delete mutable.exercises[bench.id];
    delete mutable.exercises[squat.id];
    delete mutable.muscles[chest.id];
    delete mutable.muscles[quads.id];
    delete mutable.categories[chestCat.id];
    delete mutable.categories[legsCat.id];
    delete mutable.groups.Chest;
    delete mutable.groups.Other;
  }
}

const row = (over: Partial<ExerciseRow>): ExerciseRow => ({
  id: bench.id,
  userId: null,
  name: bench.name,
  initials: 'BB',
  kind: 'weighted',
  equipment: 'barbell',
  categoryId: chestCat.id,
  primaryMuscleId: chest.id,
  howToSteps: null,
  source: null,
  externalId: null,
  isCustom: 0,
  imageUrl: null,
  imageAuthor: null,
  demoUrl: null,
  ...over,
});
const chestRow = { id: chest.id, name: chest.name, group: chest.group };

test('nameToStore writes nothing when the display label is left as is', () => {
  assert.equal(nameToStore('卧推', { name: '卧推' }), null);
  assert.equal(nameToStore('  卧推 ', { name: '卧推' }), null);
  assert.equal(nameToStore('My bench', { name: '卧推' }), 'My bench');
  assert.equal(nameToStore(' My bench ', { name: '卧推' }), 'My bench');
});

test('rows become DTOs with the display label in name and the stored value in englishName', () => {
  withZh(() => {
    const out = toExerciseOut(row({}), { id: chestCat.id, name: chestCat.name }, chestRow, [chestRow], 'zh-Hans');
    assert.equal(out.name, '卧推');
    assert.equal(out.englishName, bench.name);
    assert.equal(out.initials, 'BB'); // initials stay as stored
    assert.equal(out.equipment, 'barbell'); // equipment stays stored; labelled at render
    assert.deepEqual(
      { name: out.category!.name, englishName: out.category!.englishName },
      { name: '胸部', englishName: 'Chest' },
    );
    assert.equal(out.primary_muscle!.name, '胸');
    assert.equal(out.primary_muscle!.englishName, 'Chest');
    assert.equal(out.primary_muscle!.group, 'Chest'); // group stays stored
    assert.equal(out.secondary_muscles![0].name, '胸');

    const en = toExerciseOut(row({}), null, null, [], 'en');
    assert.equal(en.name, bench.name);
    assert.equal(en.englishName, bench.name);
  });
});

test('custom and renamed exercises keep the stored name under zh', () => {
  withZh(() => {
    const renamed = toExerciseOut(row({ name: 'My bench' }), null, null, [], 'zh-Hans');
    assert.equal(renamed.name, 'My bench');
    assert.equal(renamed.englishName, 'My bench');
    const custom = toExerciseOut(row({ isCustom: 1 }), null, null, [], 'zh-Hans');
    assert.equal(custom.name, bench.name);
  });
});

test('category and muscle DTOs carry both names', () => {
  withZh(() => {
    assert.deepEqual(toCategoryOut({ id: legsCat.id, name: 'Legs' }, 'zh-Hans'), {
      id: legsCat.id,
      name: '腿部',
      englishName: 'Legs',
    });
    assert.deepEqual(toMuscleOut({ id: quads.id, name: 'Quads', group: 'Legs' }, 'zh-Hans'), {
      id: quads.id,
      name: '股四头肌',
      englishName: 'Quads',
      group: 'Legs',
    });
    assert.equal(toCategoryOut({ id: legsCat.id, name: 'Legs' }, 'en').name, 'Legs');
  });
});

test('exercise search matches the label and the stored English name; category filters by id', () => {
  withZh(() => {
    const list = [
      toExerciseOut(row({}), { id: chestCat.id, name: chestCat.name }, null, [], 'zh-Hans'),
      toExerciseOut(
        row({ id: squat.id, name: squat.name, categoryId: legsCat.id }),
        { id: legsCat.id, name: legsCat.name },
        null,
        [],
        'zh-Hans',
      ),
      toExerciseOut(row({ id: 'c1', name: 'Zercher Hold', isCustom: 1, categoryId: null }), null, null, [], 'zh-Hans'),
    ];
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    assert.deepEqual(ids(filterExercises(list, { search: '卧' })), [bench.id]);
    assert.deepEqual(ids(filterExercises(list, { search: 'squat' })), [squat.id]);
    assert.deepEqual(ids(filterExercises(list, { search: 'zercher' })), ['c1']);
    assert.deepEqual(ids(filterExercises(list, { categoryId: legsCat.id })), [squat.id]);
    assert.deepEqual(ids(filterExercises(list, { search: 'bench', categoryId: legsCat.id })), []);
    assert.equal(filterExercises(list, {}).length, 3);
  });
});

test('lists sort by the display label: pinyin order under zh, alphabetical under en', () => {
  const zhSorted = sortByName([{ name: '卧推' }, { name: '杠铃划船' }, { name: '深蹲' }], 'zh-Hans');
  assert.deepEqual(zhSorted.map((x) => x.name), ['杠铃划船', '深蹲', '卧推']); // gang, shen, wo
  const enSorted = sortByName([{ name: 'squat' }, { name: 'Bench' }, { name: 'arm' }], 'en');
  assert.deepEqual(enSorted.map((x) => x.name), ['arm', 'Bench', 'squat']);
});

test('index letters: first letter under en, pinyin initial under zh', () => {
  assert.equal(indexLetter('bench', 'en'), 'B');
  assert.equal(indexLetter('3/4 Sit-Up', 'en'), '3');
  assert.equal(indexLetter('卧推', 'zh-Hans'), 'W');
  assert.equal(indexLetter('深蹲', 'zh-Hans'), 'S');
  assert.equal(indexLetter('杠铃划船', 'zh-Hans'), 'G');
  assert.equal(indexLetter('哑铃飞鸟', 'zh-Hans'), 'Y');
  assert.equal(indexLetter('俯卧撑', 'zh-Hans'), 'F');
  assert.equal(indexLetter('Zercher Hold', 'zh-Hans'), 'Z'); // custom names keep their letter
});

test('muscle tags show the group label, else the muscle label, else Other', () => {
  withZh(() => {
    assert.equal(muscleTag(chestRow, 'zh-Hans'), '胸部');
    assert.equal(muscleTag({ id: chest.id, name: chest.name, group: null }, 'zh-Hans'), '胸');
    assert.equal(muscleTag(null, 'zh-Hans'), '其他');
    assert.equal(muscleTag(chestRow, 'en'), 'Chest');
    assert.equal(muscleTag(null, 'en'), 'Other');
  });
});

test('ru: lists sort alphabetically in Cyrillic, index letter is the uppercased first character', () => {
  const sorted = sortByName([{ name: 'Жим' }, { name: 'Армейский жим' }, { name: 'Бёрпи' }], 'ru');
  assert.deepEqual(sorted.map((x) => x.name), ['Армейский жим', 'Бёрпи', 'Жим']);
  assert.equal(indexLetter('жим', 'ru'), 'Ж');
  assert.equal(indexLetter('bench', 'ru'), 'B');
});
