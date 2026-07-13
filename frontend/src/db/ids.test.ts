/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { catalogExerciseId, catalogLookupId, newId } from './ids.ts';

test('catalog exercise id is deterministic for the same durable key', () => {
  const a = catalogExerciseId('free-exercise-db', 'Pull_Up');
  const b = catalogExerciseId('free-exercise-db', 'Pull_Up');
  assert.equal(a, b);
});

test('different durable keys yield different ids', () => {
  assert.notEqual(
    catalogExerciseId('free-exercise-db', 'Pull_Up'),
    catalogExerciseId('free-exercise-db', 'Push_Up'),
  );
});

test('lookup ids are deterministic and namespaced by kind', () => {
  assert.equal(catalogLookupId('muscle', 'Lats'), catalogLookupId('muscle', 'Lats'));
  assert.notEqual(catalogLookupId('muscle', 'Lats'), catalogLookupId('category', 'Lats'));
});

test('newId is a 32-char hex string and unique', () => {
  const id = newId();
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.notEqual(newId(), newId());
});
