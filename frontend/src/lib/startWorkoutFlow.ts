/**
 * Starts a workout, unless one is already running (startGuard.ts has the rule
 * and the reasons). The one function every start path calls.
 */
import { Alert } from 'react-native';

import { listWorkouts, startWorkout } from '../api/workouts';
import { createStartGuard, type RunningChoice, type RunningWorkout, type StartOutcome } from './startGuard';

const guard = createStartGuard();

/** Resume is the default; Cancel leaves everything as it is. Nothing is discarded. */
const askOnPhone = (running: RunningWorkout): Promise<RunningChoice> =>
  new Promise((resolve) => {
    Alert.alert(
      'Workout in progress',
      `“${running.name}” is still running. Finish or discard it before starting another.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Resume', isPreferred: true, onPress: () => resolve('resume') },
      ],
      // Android: a tap outside the alert is a cancel.
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });

/**
 * `from: 'watch'`: asked for from the wrist, where an alert on the phone would
 * be answered by nobody. The running workout is resumed, which is the default
 * answer here too, and the wrist is put back in it by its screen.
 */
export function beginWorkout(
  body: { routine_id?: string; name?: string },
  { from = 'phone' }: { from?: 'phone' | 'watch' } = {},
): Promise<StartOutcome> {
  return guard({
    findRunning: async () => {
      const [active] = await listWorkouts({ status: 'active', limit: 1 });
      return active ? { id: active.id, name: active.name } : null;
    },
    start: async () => (await startWorkout(body)).id,
    ask: from === 'watch' ? async () => 'resume' : askOnPhone,
  });
}
