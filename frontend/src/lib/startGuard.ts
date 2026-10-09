/**
 * One workout at a time.
 *
 * Every way of starting a workout goes through here: Home's quick start and
 * routine cards, the routine view, History's empty state, and the Watch's
 * Start screen. None of them used to look for a workout already running, so a
 * second one could be started over it. The first then sat unseen behind the
 * newer — Home's bar resumes only the latest — until that was finished or
 * discarded, when it came back with hours on its clock.
 *
 * So with one running, nothing is started. The user is offered the running
 * workout instead, and nothing is discarded on their behalf.
 *
 * Pure, with what it needs passed in, so `node --test` covers it; the wiring
 * to the database and the alert is in startWorkoutFlow.ts. See startGuard.test.ts.
 */

/** What the user chose when told a workout is already running. */
export type RunningChoice = 'resume' | 'cancel';

export type RunningWorkout = { id: string; name: string };

export type StartDeps = {
  /** The workout in progress, or null. */
  findRunning(): Promise<RunningWorkout | null>;
  /** Creates the workout and resolves its id. */
  start(): Promise<string>;
  /** Asked only when one is running. */
  ask(running: RunningWorkout): Promise<RunningChoice>;
};

export type StartOutcome =
  /** Open this workout. `resumed`: it was already running; nothing was created. */
  | { workoutId: string; resumed: boolean }
  /** Stay where we are: the user cancelled, or another start is under way. */
  | null;

/**
 * Makes a guard. A second call while one is still deciding or writing resolves
 * null without starting anything: a double tap, or the same start asked for
 * from the phone and the wrist at once, would otherwise both find nothing
 * running and both start.
 */
export function createStartGuard(): (deps: StartDeps) => Promise<StartOutcome> {
  let busy = false;
  return async (deps) => {
    if (busy) return null;
    busy = true;
    try {
      const running = await deps.findRunning();
      if (running) {
        const choice = await deps.ask(running);
        return choice === 'resume' ? { workoutId: running.id, resumed: true } : null;
      }
      return { workoutId: await deps.start(), resumed: false };
    } finally {
      busy = false;
    }
  };
}
