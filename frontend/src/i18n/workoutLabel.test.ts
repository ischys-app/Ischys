import assert from 'node:assert/strict';
import { test } from 'node:test';

import { setLang } from './current.ts';
import zh from './strings/zh-Hans.json' with { type: 'json' };
import { workoutLabel } from './workoutLabel.ts';

const mutable = zh as unknown as Record<string, string>;

test('workoutLabel translates only the default name', () => {
  mutable['workout.defaultName'] = '训练';
  setLang('zh-Hans');
  try {
    assert.equal(workoutLabel(null), '训练');
    assert.equal(workoutLabel(undefined), '训练');
    assert.equal(workoutLabel(''), '训练');
    assert.equal(workoutLabel('Workout'), '训练');
    assert.equal(workoutLabel('Leg day'), 'Leg day');
    setLang('en');
    assert.equal(workoutLabel('Workout'), 'Workout');
    assert.equal(workoutLabel(null), 'Workout');
  } finally {
    setLang('en');
    delete mutable['workout.defaultName'];
  }
});
