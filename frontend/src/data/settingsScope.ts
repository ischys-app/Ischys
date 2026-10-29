/**
 * Which settings belong to the phone and which to a profile (#117). Device
 * ones live in the owner's row and are shared by every profile; the rest live
 * in the current profile's own row. Pure: no database, no expo imports.
 */
import type { SettingsUpdate } from '../api/types';

export const DEVICE_SETTINGS = ['appearance', 'haptic_feedback', 'rest_timer_alerts'] as const;
export const PROFILE_SETTINGS = ['unit', 'effort_mode', 'auto_start_rest_timer'] as const;

/** Splits an update into the part for the device row and the part for the profile row. */
export function splitUpdate(body: SettingsUpdate): { device: SettingsUpdate; profile: SettingsUpdate } {
  const device: Record<string, unknown> = {};
  const profile: Record<string, unknown> = {};
  for (const key of DEVICE_SETTINGS) if (body[key] !== undefined) device[key] = body[key];
  for (const key of PROFILE_SETTINGS) if (body[key] !== undefined) profile[key] = body[key];
  return { device: device as SettingsUpdate, profile: profile as SettingsUpdate };
}
