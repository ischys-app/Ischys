/**
 * Settings on-device. A single settings row (seeded on first run). Purely local:
 * no sync, no server. Physical `server_url`/`last_synced_at` columns linger in the
 * SQLite table from an earlier schema but are no longer mapped or read.
 */
import { eq } from 'drizzle-orm';

import { db, deviceDb } from '../db/client';
import * as schema from '../db/schema';
import type { Appearance, SettingsOut, SettingsUpdate, Unit } from '../api/types';
import { isEffortMode } from '../domain/effort';
import { nowMs } from './ids';
import { splitUpdate } from './settingsScope';

export const SETTINGS_ID = 'local';

const bool = (n: number) => n !== 0;

const isAppearance = (v: string): v is Appearance => v === 'dark' || v === 'light' || v === 'system';

function rowToOut(r: {
  unit: string;
  autoStartRestTimer: number;
  restTimerAlerts: number;
  hapticFeedback: number;
  effortMode: string;
  appearance: string;
}): SettingsOut {
  return {
    unit: r.unit as Unit,
    effort_mode: isEffortMode(r.effortMode) ? r.effortMode : 'off',
    appearance: isAppearance(r.appearance) ? r.appearance : 'system',
    auto_start_rest_timer: bool(r.autoStartRestTimer),
    rest_timer_alerts: bool(r.restTimerAlerts),
    haptic_feedback: bool(r.hapticFeedback),
  };
}

const DEFAULTS: SettingsOut = {
  unit: 'kg',
  effort_mode: 'off',
  appearance: 'system',
  auto_start_rest_timer: true,
  rest_timer_alerts: true,
  haptic_feedback: true,
};

const settingsRow = (conn: typeof db) =>
  conn.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID));

/**
 * Device-wide fields (appearance, haptics, rest-timer alerts) come from the
 * owner's row, the rest from the current profile's. With the owner active both
 * are the same file. A missing row falls back to the defaults.
 *
 * `from` reads the profile half from another profile's file (a switch reads
 * the target's before `db` moves to it); by default, the current profile's.
 */
export async function getSettings(from: typeof db = db): Promise<SettingsOut> {
  const deviceRow = (await settingsRow(deviceDb))[0];
  const profileRow = (await settingsRow(from))[0];
  const device = deviceRow ? rowToOut(deviceRow) : DEFAULTS;
  const profile = profileRow ? rowToOut(profileRow) : DEFAULTS;
  return {
    unit: profile.unit,
    effort_mode: profile.effort_mode,
    auto_start_rest_timer: profile.auto_start_rest_timer,
    appearance: device.appearance,
    rest_timer_alerts: device.rest_timer_alerts,
    haptic_feedback: device.haptic_feedback,
  };
}

export async function updateSettings(body: SettingsUpdate): Promise<SettingsOut> {
  const { device, profile } = splitUpdate(body);
  if (Object.keys(device).length > 0) {
    const patch: Record<string, unknown> = { updatedAt: nowMs() };
    if (device.appearance !== undefined) patch.appearance = device.appearance;
    if (device.rest_timer_alerts !== undefined) patch.restTimerAlerts = device.rest_timer_alerts ? 1 : 0;
    if (device.haptic_feedback !== undefined) patch.hapticFeedback = device.haptic_feedback ? 1 : 0;
    await deviceDb.update(schema.settings).set(patch).where(eq(schema.settings.id, SETTINGS_ID));
  }
  if (Object.keys(profile).length > 0) {
    const patch: Record<string, unknown> = { updatedAt: nowMs() };
    if (profile.unit !== undefined) patch.unit = profile.unit;
    if (profile.effort_mode !== undefined) patch.effortMode = profile.effort_mode;
    if (profile.auto_start_rest_timer !== undefined) patch.autoStartRestTimer = profile.auto_start_rest_timer ? 1 : 0;
    await db.update(schema.settings).set(patch).where(eq(schema.settings.id, SETTINGS_ID));
  }
  return getSettings();
}
