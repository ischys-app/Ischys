/**
 * In-memory handoff for the Exercise Library "return selection" flow.
 * The library sets a list before calling router.back(); the opener drains it
 * on next focus. Kept intentionally tiny (single global slot) so we don't have
 * to pipe selection data through nav params (which serialize awkwardly).
 */
import type { ExerciseOut } from '../api/types';

let pending: ExerciseOut[] | null = null;

export function setPendingSelection(list: ExerciseOut[]): void {
  pending = list;
}

export function takePendingSelection(): ExerciseOut[] | null {
  const p = pending;
  pending = null;
  return p;
}
