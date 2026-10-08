/** Run with: npm test */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readFileSync } from 'node:fs';

import {
  API_CONFIRM_REJECT,
  API_SEGMENT_TICK,
  hapticCall,
  type HapticKind,
} from './hapticsPlan.ts';

const KINDS: HapticKind[] = ['commit', 'light', 'select', 'success', 'warning', 'error', 'longPress'];
/** The app's minSdk, the two levels where a constant appears, and one either side. */
const API_LEVELS = [24, 29, 30, 33, 34, 36];

test('iOS keeps the Taptic Engine calls it always made', () => {
  assert.deepEqual(hapticCall('commit', 'ios', 0), { via: 'impact', style: 'medium' });
  assert.deepEqual(hapticCall('light', 'ios', 0), { via: 'impact', style: 'light' });
  assert.deepEqual(hapticCall('select', 'ios', 0), { via: 'selection' });
  assert.deepEqual(hapticCall('success', 'ios', 0), { via: 'notification', type: 'success' });
  assert.deepEqual(hapticCall('warning', 'ios', 0), { via: 'notification', type: 'warning' });
  assert.deepEqual(hapticCall('error', 'ios', 0), { via: 'notification', type: 'error' });
});

test('a long-press is silent on iOS, where the context menu plays its own', () => {
  assert.deepEqual(hapticCall('longPress', 'ios', 0), { via: 'none' });
  assert.deepEqual(hapticCall('longPress', 'android', 24), { via: 'android', type: 'long-press' });
});

test('a platform that is not Android gets the iOS calls', () => {
  for (const kind of KINDS) assert.deepEqual(hapticCall(kind, 'web', 0), hapticCall(kind, 'ios', 0));
});

test('on a current Android every kind is a system effect', () => {
  const at = (kind: HapticKind) => hapticCall(kind, 'android', 36);
  assert.deepEqual(at('commit'), { via: 'android', type: 'virtual-key' });
  assert.deepEqual(at('light'), { via: 'android', type: 'context-click' });
  assert.deepEqual(at('select'), { via: 'android', type: 'segment-tick' });
  assert.deepEqual(at('success'), { via: 'android', type: 'confirm' });
  assert.deepEqual(at('warning'), { via: 'android', type: 'long-press' });
  assert.deepEqual(at('error'), { via: 'android', type: 'reject' });
});

test('the taps need no fallback: their constants predate minSdk', () => {
  for (const api of API_LEVELS) {
    assert.deepEqual(hapticCall('commit', 'android', api), { via: 'android', type: 'virtual-key' });
    assert.deepEqual(hapticCall('light', 'android', api), { via: 'android', type: 'context-click' });
    assert.deepEqual(hapticCall('warning', 'android', api), { via: 'android', type: 'long-press' });
  }
});

test('select falls back to the clock tick before Android 14', () => {
  assert.deepEqual(hapticCall('select', 'android', API_SEGMENT_TICK - 1), {
    via: 'android',
    type: 'clock-tick',
  });
  assert.deepEqual(hapticCall('select', 'android', API_SEGMENT_TICK), {
    via: 'android',
    type: 'segment-tick',
  });
});

test('success and error fall back to the vibrator patterns before Android 11', () => {
  const before = API_CONFIRM_REJECT - 1;
  assert.deepEqual(hapticCall('success', 'android', before), { via: 'notification', type: 'success' });
  assert.deepEqual(hapticCall('error', 'android', before), { via: 'notification', type: 'error' });
  assert.deepEqual(hapticCall('success', 'android', API_CONFIRM_REJECT), {
    via: 'android',
    type: 'confirm',
  });
  assert.deepEqual(hapticCall('error', 'android', API_CONFIRM_REJECT), { via: 'android', type: 'reject' });
});

test('Android never asks for a constant the API level does not have', () => {
  // expo-haptics looks the constant up by reflection and rejects if it is
  // missing, which would leave that moment silent.
  const since: Record<string, number> = {
    'virtual-key': 5,
    'long-press': 3,
    'clock-tick': 21,
    'context-click': 23,
    confirm: 30,
    reject: 30,
    'segment-tick': 34,
  };
  for (const api of API_LEVELS) {
    for (const kind of KINDS) {
      const call = hapticCall(kind, 'android', api);
      if (call.via === 'android') assert.ok(since[call.type] <= api, `${kind} at API ${api}`);
    }
  }
});

test('success, error and a plain tap stay three different effects', () => {
  for (const api of API_LEVELS) {
    const [commit, success, error] = (['commit', 'success', 'error'] as const).map((k) =>
      JSON.stringify(hapticCall(k, 'android', api)),
    );
    assert.equal(new Set([commit, success, error]).size, 3);
  }
});

test('every effect named here exists in the installed expo-haptics', () => {
  // The plan has no imports, so it spells the enum values out. Pin them to the
  // package: a renamed value would otherwise reject at runtime, silently.
  const js = readFileSync(
    new URL('../../node_modules/expo-haptics/src/Haptics.types.ts', import.meta.url),
    'utf8',
  );
  const native = readFileSync(
    new URL(
      '../../node_modules/expo-haptics/android/src/main/java/expo/modules/haptics/HapticsRecord.kt',
      import.meta.url,
    ),
    'utf8',
  );
  for (const os of ['ios', 'android']) {
    for (const api of API_LEVELS) {
      for (const kind of KINDS) {
        const call = hapticCall(kind, os, api);
        if (call.via === 'impact') assert.ok(js.includes(`= '${call.style}'`));
        if (call.via === 'notification') assert.ok(js.includes(`= '${call.type}'`));
        if (call.via === 'android') {
          assert.ok(js.includes(`= '${call.type}'`));
          assert.ok(native.includes(`("${call.type}")`));
        }
      }
    }
  }
});
