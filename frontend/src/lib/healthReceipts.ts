/**
 * Health read "receipts" — the honest signal behind the Apple Health screen.
 *
 * HealthKit deliberately hides *read* authorisation, so a read switch in the ON
 * position can never mean "granted". The one thing we always know honestly is
 * whether data actually ARRIVED. Each read pref therefore carries a companion
 * "last received" record (timestamp + a display value) stored beside the prefs
 * in SecureStore (`ischys.healthPref.*` → `ischys.healthRecv.*`).
 *
 * The screen reads these to render a receipt:
 *   - data within 30 days      → `Receiving · <value>`   (success)
 *   - switch on, nothing ever  → `Nothing received yet`   (warning) + explainer
 *   - switch off               → plain description         (no status colour)
 *
 * `recordReadReceipt` is the write side. It belongs to the sync layer, wherever
 * a metric is actually read from HealthKit (heart rate / active energy off an
 * Apple Watch). It lives here so the screen and the sync layer share one shape
 * and one set of keys rather than drifting apart.
 */
import * as SecureStore from './secureStore';

// readBody covers waist + body fat, the only body measurements HealthKit has
// types for. It returns here with #65, which gives the values somewhere to go.
export type ReadPref = 'readHR' | 'readEnergy' | 'readBody';

/** SecureStore keys for the companion "last received" record, one per read. */
const RECV_KEY: Record<ReadPref, string> = {
  readHR: 'ischys.healthRecv.readHR',
  readEnergy: 'ischys.healthRecv.readEnergy',
  readBody: 'ischys.healthRecv.readBody',
};

/**
 * Write share-authorisation is the opposite case — HealthKit *does* expose it —
 * so it is stored as a plain status the sync layer sets from HealthKit's
 * `authorizationStatus(for:)`. Absent/unknown reads as `allowed`, matching the
 * optimistic connected state (the user went through the prompt and saves are
 * best-effort); only an explicit `denied` drives the write-denied UI.
 */
export const HEALTH_WRITE_STATUS_KEY = 'ischys.healthWrite.status';

export type WriteStatus = 'allowed' | 'denied';

/** A single "data arrived" record: when, and a ready-to-show value like `132 bpm`. */
export type Receipt = { at: string; value: string };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function receiptKey(pref: ReadPref): string {
  return RECV_KEY[pref];
}

/** Read the companion receipt for one read pref. Null when nothing ever arrived. */
export async function getReadReceipt(pref: ReadPref): Promise<Receipt | null> {
  const raw = await SecureStore.getItemAsync(RECV_KEY[pref]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as Receipt).at === 'string' &&
      typeof (parsed as Receipt).value === 'string'
    ) {
      return parsed as Receipt;
    }
  } catch {
    // Corrupt record — treat as "nothing received".
  }
  return null;
}

/**
 * Record that data actually arrived for a read, with a display value (e.g.
 * `132 bpm`, `312 cal`). Call this from the sync layer at the moment a metric is
 * read from HealthKit, so the screen can state reality on the next visit.
 */
export async function recordReadReceipt(pref: ReadPref, value: string): Promise<void> {
  const record: Receipt = { at: new Date().toISOString(), value };
  await SecureStore.setItemAsync(RECV_KEY[pref], JSON.stringify(record));
}

/** Clear all receipts (on Disconnect, alongside the prefs). */
export async function clearReadReceipts(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(RECV_KEY.readHR),
    SecureStore.deleteItemAsync(RECV_KEY.readEnergy),
    SecureStore.deleteItemAsync(HEALTH_WRITE_STATUS_KEY),
  ]);
}

export type ReceiptKind = 'receiving' | 'nothing' | 'off';

/**
 * Resolve the receipt state from reality (did data arrive, and recently?) and
 * intent (is the switch on?). Never consults a permission — HealthKit won't
 * expose one for reads.
 */
export function receiptKind(
  receipt: Receipt | null,
  enabled: boolean,
  now: number = Date.now(),
): ReceiptKind {
  if (!enabled) return 'off';
  if (!receipt) return 'nothing';
  const at = Date.parse(receipt.at);
  if (Number.isNaN(at) || now - at > THIRTY_DAYS_MS) return 'nothing';
  return 'receiving';
}

/** Read the persisted write share-auth status. Defaults to `allowed`. */
export async function getWriteStatus(): Promise<WriteStatus> {
  const raw = await SecureStore.getItemAsync(HEALTH_WRITE_STATUS_KEY);
  return raw === 'denied' ? 'denied' : 'allowed';
}
