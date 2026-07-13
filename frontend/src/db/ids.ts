/**
 * Row identifiers. Catalog rows (exercises, muscles, categories) use
 * DETERMINISTIC UUIDv5 ids derived from their durable natural key, so the same
 * catalog entry has the same id on every device — cross-device references to
 * catalog rows line up without syncing the catalog itself. User-created rows
 * use a random id (hex, offset-free UUIDv4).
 *
 * Self-contained (uuid is pure JS) so `node --test` can run it.
 */
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

/** Fixed namespace for all Ischys deterministic ids. Never change this. */
export const ISCHYS_NS = '6f9b1e2c-2a4d-5c7e-9f10-000000000001';

const compact = (u: string) => u.replace(/-/g, '');

/** Deterministic id for a catalog exercise, from (source, external_id). */
export function catalogExerciseId(
  source: string | null | undefined,
  externalId: string | null | undefined,
): string {
  return compact(uuidv5(`exercise:${source ?? ''}:${externalId ?? ''}`, ISCHYS_NS));
}

/** Deterministic id for a muscle/category lookup row, from its unique name. */
export function catalogLookupId(kind: 'muscle' | 'category', name: string): string {
  return compact(uuidv5(`${kind}:${name}`, ISCHYS_NS));
}

/** Fresh random id for a user-created row (hex UUIDv4, dashes stripped). */
export function newId(): string {
  return compact(uuidv4());
}
