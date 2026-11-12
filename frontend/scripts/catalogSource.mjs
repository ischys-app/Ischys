// Emits the English catalog source list (JSON on stdout) for translation.
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(
  readFileSync(new URL('../assets/catalog/catalog.json', import.meta.url), 'utf8'),
);
const uniq = (xs) => [...new Set(xs)].sort();

const out = {
  exercises: Object.fromEntries(catalog.exercises.map((e) => [e.id, e.name])),
  muscles: Object.fromEntries(catalog.muscles.map((m) => [m.id, m.name])),
  categories: Object.fromEntries(catalog.categories.map((c) => [c.id, c.name])),
  groups: uniq(catalog.muscles.map((m) => m.group)),
  equipment: uniq(catalog.exercises.map((e) => e.equipment).filter(Boolean)),
};
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
