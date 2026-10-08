/**
 * Haptic feedback — fired on the *causal* event and reserved for moments that
 * earn it (a set logged, a PR, a snap, a destructive confirm). See the
 * apple-design skill §13: causality, harmony (same frame as the visual), and
 * utility (over-feedback trains people to ignore all of it).
 *
 * There is no settings context, and haptics fire in hot paths (every set
 * completion), so the user's `haptic_feedback` preference is cached here: loaded
 * once at startup and updated when the toggle changes. `impactAsync` etc. are
 * fire-and-forget — never awaited on the interaction path.
 *
 * iOS is the reference. expo-haptics realises the same calls on Android as
 * fixed vibrator waveforms (40–60 ms buzzes at a set amplitude), which feel
 * like a buzz where iOS gives a tap. So on Android each kind plays the system
 * effect with the same role instead, through `performAndroidHapticsAsync`: the
 * device's own tuned click, and like the Taptic Engine it follows the system's
 * touch-feedback setting. Which effect is decided in hapticsPlan.ts:
 *
 *   kind       iOS                    Android                     why
 *   commit     impact, medium         VIRTUAL_KEY                 the standard click: one firm tap
 *   light      impact, light          CONTEXT_CLICK               a tick, lighter than the click
 *   select     selection              SEGMENT_TICK (14+),         the tick for stepping through
 *                                     else CLOCK_TICK             choices; never above `light`
 *   success    notification, success  CONFIRM (11+)               the system's "it worked"
 *   error      notification, error    REJECT (11+)                the system's "it failed": a double click
 *   warning    notification, warning  LONG_PRESS                  one heavy click, weightier than commit;
 *                                                                 Android has no warning effect
 *   longPress  none (the context      LONG_PRESS                  what a long-press feels like on each
 *              menu plays its own)                                system
 *
 * Before Android 11 there is no CONFIRM or REJECT, so success and error fall
 * back to the vibrator patterns: two pulses and three, as on iOS.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { hapticCall, type HapticKind } from './hapticsPlan';

let enabled = true;

/** Keep the cached preference in sync (call on settings load + on toggle). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0;

function fire(kind: HapticKind): Promise<void> {
  const call = hapticCall(kind, Platform.OS, apiLevel);
  switch (call.via) {
    case 'impact':
      return Haptics.impactAsync(call.style as Haptics.ImpactFeedbackStyle);
    case 'notification':
      return Haptics.notificationAsync(call.type as Haptics.NotificationFeedbackType);
    case 'selection':
      return Haptics.selectionAsync();
    case 'android':
      return Haptics.performAndroidHapticsAsync(call.type as Haptics.AndroidHaptics);
    case 'none':
      return Promise.resolve();
  }
}

const play = (kind: HapticKind) => {
  if (!enabled) return;
  try {
    void fire(kind).catch(() => {});
  } catch {
    // Feedback only; a device without the effect just stays quiet.
  }
};

export const haptics = {
  /** A committing tap — completing a set, a swipe snapping to delete. */
  commit: () => play('commit'),
  /** A lighter tap — a swipe crossing its threshold, a minor commit. */
  light: () => play('light'),
  /** A crisp selection tick — cycling set type, switching a segment/tab. */
  select: () => play('select'),
  /** Achievement — a personal record, finishing a workout. */
  success: () => play('success'),
  /** About to do something destructive/irreversible. */
  warning: () => play('warning'),
  /** Something failed. */
  error: () => play('error'),
  /**
   * A long-press was recognised. Where iOS opens a context menu the system
   * plays this itself, so there it is silent.
   */
  longPress: () => play('longPress'),
};
