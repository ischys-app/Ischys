/**
 * The bar and plates this user's gym has, for the plate calculator.
 *
 * Kept in SecureStore as one JSON blob per weight unit, mirroring
 * `lib/bodyweight.ts` and `lib/warmupVolume.ts`. It belongs here rather than in
 * the `settings` table because it describes a *place*, not the account: it
 * never syncs, has no history, and changes when the user changes gym. That also
 * keeps it out of a migration.
 *
 * As with those two, resolve it BEFORE any expo-sqlite transaction — awaiting
 * SecureStore inside one hangs it (see recordStore.ts).
 *
 * The keys and the per-unit rules live in `plateSetupStore.ts`.
 */
import * as SecureStore from 'expo-secure-store';

import type { BarSetup } from '../domain/plateMath';
import type { Unit } from '../domain/units';
import { readPlateSetup, writePlateSetup } from './plateSetupStore';

/** The setup stored for `unit`, or that unit's standard set. Never throws. */
export function getPlateSetup(unit: Unit): Promise<BarSetup> {
  return readPlateSetup(SecureStore, unit);
}

/** Persist the setup under its own unit. Storage being unavailable costs the edit, not the app. */
export function setPlateSetup(setup: BarSetup): Promise<void> {
  return writePlateSetup(SecureStore, setup);
}
