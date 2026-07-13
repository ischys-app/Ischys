/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSeedRows } from './seedPlan.ts';
import type { Catalog } from './catalogTypes.ts';

const catalog: Catalog = {
  categories: [{ id: 'c1', name: 'Back' }],
  muscles: [{ id: 'm1', name: 'Lats', group: 'Back' }],
  exercises: [
    {
      id: 'e1',
      name: 'Pull Up',
      initials: 'PU',
      kind: 'bodyweight',
      equipment: 'bodyweight',
      categoryId: 'c1',
      primaryMuscleId: 'm1',
      secondaryMuscleIds: ['m1'],
      howToSteps: ['Hang', 'Pull'],
      source: 'free-exercise-db',
      externalId: 'Pull_Up',
      imageUrl: null,
    },
  ],
};

test('maps catalog to insert-ready rows with shared-catalog markers', () => {
  const rows = buildSeedRows(catalog);
  assert.equal(rows.categories[0].id, 'c1');
  assert.equal(rows.muscles[0].group, 'Back');
  const ex = rows.exercises[0];
  assert.equal(ex.id, 'e1');
  assert.equal(ex.userId, null); // shared catalog row
  assert.equal(ex.isCustom, 0);
  assert.deepEqual(ex.howToSteps, ['Hang', 'Pull']);
  assert.deepEqual(rows.secondary[0], { exerciseId: 'e1', muscleId: 'm1' });
});

test('is a pure transform — same input, same output', () => {
  assert.deepEqual(buildSeedRows(catalog), buildSeedRows(catalog));
});
