/**
 * Settings on-device. A single settings row (seeded on first run). Sync-related
 * fields (sync_frequency, server_url) are retained but unused in the on-device
 * app and returned as inert defaults. `triggerSync` is a no-op kept for callers.
 */
import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import * as schema from '../db/schema';
import type { SettingsOut, SettingsUpdate, Unit } from '../api/types';
import { nowMs } from './ids';

export const SETTINGS_ID = 'local';

const bool = (n: number) => n !== 0;

function rowToOut(r: {
  unit: string;
  autoStartRestTimer: number;
  restTimerAlerts: number;
  hapticFeedback: number;
  lastSyncedAt: number | null;
}): SettingsOut {
  return {
    unit: r.unit as Unit,
    auto_start_rest_timer: bool(r.autoStartRestTimer),
    rest_timer_alerts: bool(r.restTimerAlerts),
    haptic_feedback: bool(r.hapticFeedback),
    sync_frequency: 'manual',
    server_url: '',
    last_synced_at: r.lastSyncedAt === null ? null : new Date(r.lastSyncedAt).toISOString(),
  };
}

export async function getSettings(): Promise<SettingsOut> {
  const r = (await db.select().from(schema.settings).where(eq(schema.settings.id, SETTINGS_ID)))[0];
  if (r) return rowToOut(r);
  // Defaults if the seed hasn't run yet.
  return {
    unit: 'kg',
    auto_start_rest_timer: true,
    rest_timer_alerts: true,
    haptic_feedback: true,
    sync_frequency: 'manual',
    server_url: '',
    last_synced_at: null,
  };
}

export async function updateSettings(body: SettingsUpdate): Promise<SettingsOut> {
  const patch: Record<string, unknown> = { updatedAt: nowMs() };
  if (body.unit !== undefined) patch.unit = body.unit;
  if (body.auto_start_rest_timer !== undefined) patch.autoStartRestTimer = body.auto_start_rest_timer ? 1 : 0;
  if (body.rest_timer_alerts !== undefined) patch.restTimerAlerts = body.rest_timer_alerts ? 1 : 0;
  if (body.haptic_feedback !== undefined) patch.hapticFeedback = body.haptic_feedback ? 1 : 0;
  await db.update(schema.settings).set(patch).where(eq(schema.settings.id, SETTINGS_ID));
  return getSettings();
}

export async function triggerSync(): Promise<{ synced_at: string }> {
  return { synced_at: new Date().toISOString() };
}
