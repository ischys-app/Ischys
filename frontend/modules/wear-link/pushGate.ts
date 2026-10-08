/**
 * Decides which state pushes are worth a message to the Watch.
 *
 * While a rest runs the workout screen builds a new state every second, and
 * the only thing that has changed in it is `restRemaining`. The Watch does not
 * need those: it is told when the rest ends (`restEndsAt`) and counts down to
 * that itself, on its own clock, precisely so it does not depend on the phone
 * staying awake. Sent anyway, each one is a Bluetooth message and a wake of
 * the Watch app's listener — some hundred of them per rest.
 *
 * So a state that differs from the last one seen only in its countdown is
 * skipped. A state exactly like the last is not: nothing builds the same state
 * twice by accident, so that is the phone answering a Watch that asked for it
 * (`requestState`), and it must go.
 *
 * In a file of its own, with no native import, so `node --test` can load it.
 */
export function createPushGate() {
  // The last state seen, with and without its countdown.
  let lastExact: string | null = null;
  let lastSteady: string | null = null;

  /** Whether `state` should be sent. Call once per push, in order. */
  return function shouldSend(state: Record<string, unknown>): boolean {
    const exact = JSON.stringify(state);
    // Only a countdown the Watch can derive is left out of the comparison:
    // without an end date the pushed seconds are all it has.
    const derivable = typeof state.restEndsAt === 'number' && state.restEndsAt > 0;
    const steady = derivable ? JSON.stringify({ ...state, restRemaining: 0 }) : exact;
    const countdownOnly = exact !== lastExact && steady === lastSteady;
    lastExact = exact;
    lastSteady = steady;
    return !countdownOnly;
  };
}
