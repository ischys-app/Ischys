export type CatalogCategory = { id: string; name: string };
export type CatalogMuscle = { id: string; name: string; group: string | null };
export type CatalogExercise = {
  id: string;
  name: string;
  initials: string;
  kind: string;
  equipment: string;
  categoryId: string | null;
  primaryMuscleId: string | null;
  secondaryMuscleIds: string[];
  howToSteps: string[] | null;
  source: string;
  externalId: string;
  imageUrl: string | null;
};
export type Catalog = {
  categories: CatalogCategory[];
  muscles: CatalogMuscle[];
  exercises: CatalogExercise[];
};
