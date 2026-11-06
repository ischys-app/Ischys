import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_NAME } from '../lib/activeProfile.ts';
import { setLang } from './current.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };
import { profileNameLabel, workoutLabel } from './defaultLabels.ts';

const mutable = zh as unknown as Record<string, string>;

/** Set values for the test, then put back exactly what was there (the JSON is shared). */
function withStrings(values: Record<string, string>, fn: () => void): void {
  const saved = Object.fromEntries(Object.keys(values).map((k) => [k, k in mutable ? mutable[k] : undefined]));
  Object.assign(mutable, values);
  try {
    fn();
  } finally {
    setLang('en');
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete mutable[k];
      else mutable[k] = v;
    }
  }
}

test('workoutLabel translates only the default names', () => {
  withStrings({ 'workout.defaultName': '训练', 'workout.emptyName': '空白训练' }, () => {
    setLang('zh-Hans');
    assert.equal(workoutLabel(null), '训练');
    assert.equal(workoutLabel(undefined), '训练');
    assert.equal(workoutLabel(''), '训练');
    assert.equal(workoutLabel('Workout'), '训练');
    assert.equal(workoutLabel('Empty Workout'), '空白训练');
    assert.equal(workoutLabel('Leg day'), 'Leg day');
    setLang('en');
    assert.equal(workoutLabel('Workout'), 'Workout');
    assert.equal(workoutLabel('Empty Workout'), 'Empty Workout');
    assert.equal(workoutLabel(null), 'Workout');
  });
});

test('profileNameLabel translates only the default profile name', () => {
  assert.equal(DEFAULT_NAME, 'Athlete'); // the label maps exactly this stored value
  withStrings({ 'profile.defaultName': '运动员' }, () => {
    setLang('zh-Hans');
    assert.equal(profileNameLabel(DEFAULT_NAME), '运动员');
    assert.equal(profileNameLabel('Vasilis'), 'Vasilis');
    assert.equal(profileNameLabel('athlete'), 'athlete');
    setLang('en');
    assert.equal(profileNameLabel(DEFAULT_NAME), 'Athlete');
  });
});

test('the shipped zh strings for the default names are real translations', () => {
  setLang('zh-Hans');
  try {
    assert.notEqual(workoutLabel('Empty Workout'), 'Empty Workout');
    assert.notEqual(profileNameLabel(DEFAULT_NAME), DEFAULT_NAME);
  } finally {
    setLang('en');
  }
});
