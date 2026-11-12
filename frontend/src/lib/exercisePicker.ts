/**
 * Lets the Exercise Detail screen add or remove the exercise it is showing,
 * when it was opened from the Add Exercise picker.
 *
 * The picker owns the selection — it is the screen with the "Add N" button and
 * the one that returns the list. Detail is pushed on top of it and needs to act
 * on that same selection, not keep a second copy that would disagree the moment
 * either side changed.
 *
 * A single module-level slot rather than context: detail is a separate route,
 * and the alternative is threading selection through navigation params, which
 * `pendingSelection.ts` already exists to avoid.
 */
import type { ExerciseOut } from '../api/types';
import { onProfileSwitch } from './activeProfile.ts';

export type PickerBridge = {
  isSelected: (id: string) => boolean;
  toggle: (exercise: ExerciseOut) => void;
};

let current: PickerBridge | null = null;

/**
 * Called by the picker while it is mounted. The returned release is
 * unmount-safe: it only clears the slot if this bridge is still the one in it,
 * so a slow unmount can't wipe a picker that has just mounted.
 */
export function registerPicker(bridge: PickerBridge): () => void {
  current = bridge;
  return () => {
    if (current === bridge) current = null;
  };
}

/** Whether a picker is mounted to act on. Detail shows no bar without one. */
export function pickerIsActive(): boolean {
  return current !== null;
}

/** False when no picker is mounted — browsing an exercise selects nothing. */
export function pickerIsSelected(id: string): boolean {
  return current?.isSelected(id) ?? false;
}

/** Returns whether a picker was there to handle it. */
export function pickerToggle(exercise: ExerciseOut): boolean {
  if (!current) return false;
  current.toggle(exercise);
  return true;
}

/** Drops the registration. Test seam — production releases via `registerPicker`. */
export function resetPicker(): void {
  current = null;
}

// A picker holds the previous profile's selection; its screen is dismissed
// with the switch, and nothing may toggle into it meanwhile (#117).
onProfileSwitch(resetPicker);
