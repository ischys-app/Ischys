/**
 * Pure transform: bundled catalog asset -> rows ready for insertion. Catalog
 * exercises are shared (userId null, isCustom 0). Self-contained so node --test
 * can run it (no schema/native imports).
 */
import type { Catalog } from './catalogTypes.ts';

export function buildSeedRows(catalog: Catalog) {
  return {
    categories: catalog.categories.map((c) => ({ id: c.id, name: c.name })),
    muscles: catalog.muscles.map((m) => ({ id: m.id, name: m.name, group: m.group })),
    exercises: catalog.exercises.map((e) => ({
      id: e.id,
      userId: null as string | null,
      name: e.name,
      initials: e.initials,
      kind: e.kind,
      equipment: e.equipment,
      categoryId: e.categoryId,
      primaryMuscleId: e.primaryMuscleId,
      howToSteps: e.howToSteps,
      source: e.source,
      externalId: e.externalId,
      isCustom: 0,
      imageUrl: e.imageUrl,
      imageAuthor: null as string | null,
      demoUrl: null as string | null,
    })),
    secondary: catalog.exercises.flatMap((e) =>
      e.secondaryMuscleIds.map((muscleId) => ({ exerciseId: e.id, muscleId })),
    ),
  };
}
