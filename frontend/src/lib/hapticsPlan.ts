/**
 * Which native effect each kind of haptic plays, per platform. No imports, so
 * `node --test` can run it without resolving expo-haptics. See haptics.ts for
 * the table and the reasoning, and hapticsPlan.test.ts.
 */

export type HapticKind =
  | 'commit'
  | 'light'
  | 'select'
  | 'success'
  | 'warning'
  | 'error'
  | 'longPress';

/**
 * One call into expo-haptics. The strings are the values of its enums
 * (`ImpactFeedbackStyle`, `NotificationFeedbackType`, `AndroidHaptics`); the
 * test pins them against the installed package.
 */
export type HapticCall =
  | { via: 'impact'; style: 'light' | 'medium' }
  | { via: 'notification'; type: 'success' | 'warning' | 'error' }
  | { via: 'selection' }
  /** A system `HapticFeedbackConstants` effect, played by the device's own engine. */
  | { via: 'android'; type: AndroidEffect }
  /** Nothing to play: the system supplies this one itself. */
  | { via: 'none' };

export type AndroidEffect =
  | 'virtual-key'
  | 'context-click'
  | 'clock-tick'
  | 'segment-tick'
  | 'confirm'
  | 'reject'
  | 'long-press';

/** `HapticFeedbackConstants.CONFIRM` and `REJECT` arrived in Android 11. */
export const API_CONFIRM_REJECT = 30;
/** `HapticFeedbackConstants.SEGMENT_TICK` arrived in Android 14. */
export const API_SEGMENT_TICK = 34;

const IOS: Record<HapticKind, HapticCall> = {
  commit: { via: 'impact', style: 'medium' },
  light: { via: 'impact', style: 'light' },
  select: { via: 'selection' },
  success: { via: 'notification', type: 'success' },
  warning: { via: 'notification', type: 'warning' },
  error: { via: 'notification', type: 'error' },
  longPress: { via: 'none' },
};

function android(kind: HapticKind, apiLevel: number): HapticCall {
  switch (kind) {
    case 'commit':
      return { via: 'android', type: 'virtual-key' };
    case 'light':
      return { via: 'android', type: 'context-click' };
    case 'select':
      return { via: 'android', type: apiLevel >= API_SEGMENT_TICK ? 'segment-tick' : 'clock-tick' };
    case 'success':
      // Before Android 11 the system has no effect for an outcome, so the
      // vibrator pattern stands in: two pulses, as on iOS.
      return apiLevel >= API_CONFIRM_REJECT
        ? { via: 'android', type: 'confirm' }
        : { via: 'notification', type: 'success' };
    case 'error':
      return apiLevel >= API_CONFIRM_REJECT
        ? { via: 'android', type: 'reject' }
        : { via: 'notification', type: 'error' };
    case 'warning':
    case 'longPress':
      return { via: 'android', type: 'long-press' };
  }
}

/**
 * `os` is `Platform.OS`, `apiLevel` is `Platform.Version` on Android. Anything
 * that is not Android gets the iOS calls, which is what every platform got
 * before this existed.
 */
export function hapticCall(kind: HapticKind, os: string, apiLevel: number): HapticCall {
  return os === 'android' ? android(kind, apiLevel) : IOS[kind];
}
