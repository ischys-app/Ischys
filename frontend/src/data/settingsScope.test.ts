/** Run with: npm test — which settings belong to the phone and which to a profile. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SettingsOut } from '../api/types.ts';
import { DEVICE_SETTINGS, PROFILE_SETTINGS, splitUpdate } from './settingsScope.ts';

test('splitUpdate sends each field to its own half', () => {
  assert.deepEqual(
    splitUpdate({ unit: 'lb', appearance: 'light', haptic_feedback: false, auto_start_rest_timer: false }),
    { device: { appearance: 'light', haptic_feedback: false }, profile: { unit: 'lb', auto_start_rest_timer: false } },
  );
});

test('splitUpdate of an empty update is two empty halves', () => {
  assert.deepEqual(splitUpdate({}), { device: {}, profile: {} });
});

test('the two lists cover every settings key exactly once', () => {
  const all: SettingsOut = {
    unit: 'kg',
    effort_mode: 'off',
    appearance: 'system',
    auto_start_rest_timer: true,
    rest_timer_alerts: true,
    haptic_feedback: true,
  };
  const listed = [...DEVICE_SETTINGS, ...PROFILE_SETTINGS].sort();
  assert.deepEqual(listed, Object.keys(all).sort());
});
