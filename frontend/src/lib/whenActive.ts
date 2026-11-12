/**
 * lib/activeGate.ts bound to React Native: run something, or show an alert,
 * once the app is in the foreground.
 *
 * Use `alertWhenActive` for any alert that can be reached from the background:
 * a Watch action, a Live Activity button, a rest alert, a Health sync. A plain
 * `Alert.alert` there is presented by UIKit with no foreground scene, while
 * the phone may be locked and nobody is looking. Alerts answering a tap on the
 * screen can keep using `Alert.alert`.
 */
import { Alert, AppState, type AlertButton, type AlertOptions } from 'react-native';

import { createAlertWhenActive, createWhenActive } from './activeGate';

export const whenActive = createWhenActive({
  current: () => AppState.currentState,
  subscribe: (listener) => {
    const sub = AppState.addEventListener('change', listener);
    return () => sub.remove();
  },
});

/** `Alert.alert`, held until the app is active. Repeats while waiting show once. */
export const alertWhenActive = createAlertWhenActive<[buttons?: AlertButton[], options?: AlertOptions]>(
  whenActive,
  (title, message, buttons, options) => Alert.alert(title, message, buttons, options),
);
