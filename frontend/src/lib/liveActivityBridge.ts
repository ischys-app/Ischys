/**
 * Applies Live Activity card taps, from anywhere in the app.
 *
 * A LiveActivityIntent makes iOS launch the app in the background if it is not
 * already running. That launch starts Expo Router at the root route, so the
 * active-workout screen is NOT mounted and cannot be the thing that drains the
 * queue — a `✓` tapped on the Lock Screen would be silently dropped. Draining
 * therefore lives here and runs from the root layout.
 *
 * The API is the source of truth. This module writes sets exactly as
 * `toggleDone` does (carry-forward included) and then re-pushes the card so its
 * `next` block, which the intent nils out when it optimistically redraws, is
 * refilled and the ✓ stays tappable for the following set.
 */
import * as LiveActivity from '../../modules/live-activity';
import type { WorkoutOut } from '../api/types';
import { getWorkout, listWorkouts, patchSet } from '../api/workouts';
import { carryFor, completionPatch, resolveSet } from '../components/workout/setCarry';
import { buildLiveActivityState } from './liveActivityState';

/** Rest lives only in the workout screen's state, so it is relayed, not applied. */
export type RestAction = { type: 'skip' } | { type: 'adjust'; seconds: number };

type RestListener = (action: RestAction) => void;
type ChangeListener = (restSeconds: number) => void;

const restListeners = new Set<RestListener>();
const changeListeners = new Set<ChangeListener>();

/** The workout screen, when mounted, mirrors rest actions into its own timer. */
export function onRestAction(listener: RestListener): () => void {
  restListeners.add(listener);
  return () => restListeners.delete(listener);
}

/**
 * Fired after sets were written, with the rest the completed exercise calls for.
 * A mounted screen refetches and starts that rest — it cannot work the value out
 * for itself, because its own state is still pre-write.
 */
export function onWorkoutChanged(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

const numStr = (n: number | null | undefined) => (n == null ? '' : String(n));

/** WorkoutOut → the shape `buildLiveActivityState` reads. */
const forSnapshot = (w: WorkoutOut) =>
  w.exercises.map((we) => ({
    name: we.exercise.name,
    rest: we.rest_seconds,
    sets: we.sets.map((s) => ({
      id: s.id,
      weight: numStr(s.weight),
      reps: numStr(s.reps),
      done: s.done,
    })),
  }));

/**
 * Marks a set done, filling in the carried-forward numbers first via the same
 * `completionPatch` the in-app ✓ uses, so a set completed from the Lock Screen
 * logs exactly what the app would have logged. Returns the rest to start, or
 * null if the set was already done (a queued tap can outlive a resume).
 */
async function completeSet(w: WorkoutOut, setId: string): Promise<number | null> {
  const we = w.exercises.find((e) => e.sets.some((s) => s.id === setId));
  const index = we?.sets.findIndex((s) => s.id === setId) ?? -1;
  if (!we || index === -1) return null;

  const set = we.sets[index];
  if (set.done) return null;

  const values = we.sets.map((s) => ({ weight: numStr(s.weight), reps: numStr(s.reps) }));
  const { patch } = completionPatch(values, index);

  await patchSet(setId, { ...patch, done: true });

  // Keep the local copy honest so a second queued tap sees this set as done.
  set.done = true;
  if (patch.weight !== undefined) set.weight = patch.weight;
  if (patch.reps !== undefined) set.reps = patch.reps;

  return we.rest_seconds;
}

/** Re-push the card from server truth, refilling `next`. */
async function pushCard(w: WorkoutOut, restSeconds: number | null): Promise<void> {
  const snapshot = buildLiveActivityState(forSnapshot(w), restSeconds != null, (sets, i) =>
    resolveSet(sets[i], carryFor(sets, i)),
  );
  if (!snapshot) {
    await LiveActivity.end();
    return;
  }

  const now = Date.now();
  await LiveActivity.update({
    ...snapshot,
    restStartedAt: restSeconds != null ? now : undefined,
    restEndsAt: restSeconds != null ? now + restSeconds * 1000 : undefined,
  });
}

let running = false;

/**
 * Drains the queue and applies it. Safe to call from several places at once —
 * `consumeActions` clears the queue natively, and the guard stops two overlapping
 * runs from double-writing.
 */
export async function applyPendingCardActions(): Promise<void> {
  if (running || !LiveActivity.isSupported()) return;

  const actions = LiveActivity.consumeActions();
  if (actions.length === 0) return;

  running = true;
  try {
    for (const action of actions) {
      if (action.action === 'skipRest') restListeners.forEach((l) => l({ type: 'skip' }));
      if (action.action === 'adjustRest') {
        restListeners.forEach((l) => l({ type: 'adjust', seconds: action.seconds }));
      }
    }

    const completions = actions.filter((a) => a.action === 'completeSet');
    if (completions.length === 0) return;

    const [active] = await listWorkouts({ status: 'active', limit: 1 });
    if (!active) return;
    const workout = await getWorkout(active.id);

    let rest: number | null = null;
    for (const done of completions) {
      if (done.action !== 'completeSet') continue;
      const seconds = await completeSet(workout, done.setId);
      if (seconds != null) rest = seconds;
    }

    if (rest == null) return; // every tap was stale
    changeListeners.forEach((l) => l(rest));
    await pushCard(workout, rest);
  } catch {
    // The queue is already drained. Losing a tap beats applying it twice, and
    // the screen refetches from the server whenever it regains focus.
  } finally {
    running = false;
  }
}
