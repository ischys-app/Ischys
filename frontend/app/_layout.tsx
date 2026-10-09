// Polyfill crypto.getRandomValues before anything (uuid v4 in the local repo
// needs it; React Native/Hermes doesn't provide it natively). Must be first.
import 'react-native-get-random-values';

import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert, AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AboveNavigationBar } from '../src/components/AboveNavigationBar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { WatchAction } from '../modules/health';
import * as LiveActivity from '../modules/live-activity';
import {
  discardWorkout,
  finishWorkout,
  getDashboard,
  getSettings,
  listWorkouts,
} from '../src/api/workouts';
import { beginWorkout } from '../src/lib/startWorkoutFlow';
import { setHapticsEnabled } from '../src/lib/haptics';
import { getThemeId } from '../src/lib/themePref';
import { setEffortMode } from '../src/lib/effortMode';
import { setWeightUnit } from '../src/lib/weightUnit';
import { useLocalDbBootstrap } from '../src/db/bootstrap';
import { usePrFlagBackfill } from '../src/data/prBackfill';
import { applyPendingCardActions, reconcileCardOnLaunch } from '../src/lib/liveActivityBridge';
import {
  consumeWatchActions,
  ensureWatchSaveListener,
  onWatchAction,
  pushWatchState,
  setWatchThemeId,
  syncFinishedWorkout,
} from '../src/lib/healthSync';
import { forgetActiveWorkout } from '../src/lib/activeWorkout';
import { clearRest } from '../src/lib/restSession';
import { saveSummary } from '../src/lib/summaryCache';
import {
  completesWorkout,
  finishRequestId,
  finishVerdict,
  notifyWatchFinished,
  routeWatchFinish,
  screenHoldsWatchFinish,
} from '../src/lib/watchFinish';
import { parseServerDate } from '../src/lib/serverTime';
import { color } from '../src/theme/tokens';

/**
 * Live Activity taps are drained here, not in the workout screen: an intent can
 * cold-launch the app in the background, and that launch starts at the root
 * route with no workout screen mounted to receive them.
 */
function useLiveActivityActions() {
  useEffect(() => {
    void reconcileCardOnLaunch();
    void applyPendingCardActions(); // taps that launched us, or landed while away

    const tapped = LiveActivity.addActionListener(() => void applyPendingCardActions());
    const resumed = AppState.addEventListener('change', (state) => {
      if (state === 'active') void applyPendingCardActions();
    });
    return () => {
      tapped.remove();
      resumed.remove();
    };
  }, []);
}

/**
 * Starting a workout from the Watch's Start screen, handled at the root so it
 * works from any tab — not just Home. Starts by routine id directly (no lookup
 * that could miss) and navigates into the workout, which then mirrors to the
 * Watch. Other Watch actions (log set, rest…) are handled by the workout screen.
 */
function useWatchStart() {
  useEffect(
    () =>
      onWatchAction((a) => {
        // The Watch's Start screen asking for the routine list. Answered here
        // and not on Home, because the Watch app can be opened with the phone
        // app closed: iOS relaunches it at the root route, where Home never
        // mounts and so never pushes. That is why opening the Watch app on its
        // own showed "No routines yet" until a workout had been run.
        if (a.action === 'requestState') {
          void (async () => {
            try {
              // A mounted workout screen owns the Watch state and answers this
              // itself. Pushing a Start screen over a running session would
              // throw the wrist back to the routine list mid-workout.
              const [active] = await listWorkouts({ status: 'active', limit: 1 });
              if (active) return;
              const dash = await getDashboard();
              pushWatchState({
                screen: 'start',
                routines: dash.routines.map((r) => ({
                  id: r.id,
                  name: r.name,
                  initials: r.initials,
                  exerciseCount: r.exercise_count,
                })),
              });
            } catch {
              // No data to answer with; the Watch keeps what it had.
            }
          })();
          return;
        }
        if (a.action !== 'startEmpty' && a.action !== 'startRoutine') return;
        void (async () => {
          try {
            // One workout at a time (startGuard.ts). A start can arrive with
            // one already running — tapped twice, or a Watch that never heard
            // the first had begun. The one there is is opened instead; its
            // screen puts the wrist back in it.
            const begun = await beginWorkout(
              a.action === 'startRoutine' ? { routine_id: a.routineId } : {},
              { from: 'watch' },
            );
            if (!begun) return;
            if (begun.resumed && screenHoldsWatchFinish()) return; // already on screen
            router.push(`/workout/${begun.workoutId}`);
          } catch {
            // Nothing could be started; the Watch stays on its Start screen.
          }
        })();
      }),
    [],
  );
}

/**
 * Completes a workout the user finished on the Watch, when no workout screen is
 * mounted to do it.
 *
 * Finishing on the wrist asks the phone to finish. That request was only ever
 * handled inside the workout screen — so
 * finishing while the phone sat in a pocket (backgrounded and since terminated,
 * or simply backed out to Home) dropped it: the Watch showed the workout done
 * and the phone still called it active, offering to resume a workout that was
 * already over.
 *
 * Mounted screen wins when there is one — see `routeWatchFinish`. This is the
 * fallback, and deliberately does NOT navigate: it can run while the app is in
 * the background or sitting on an unrelated tab, and yanking the user to a
 * summary they didn't ask for is worse than letting them find it in History.
 *
 * A Watch that is waiting to hear how the finish went (its request carries a
 * `finishId`, #95) is told either way, and keeps recording until it is. One
 * that is not waiting has already ended its session and is told nothing.
 */
function useWatchFinish() {
  useEffect(() => {
    // One finish at a time: the queue drained at launch and a live message can
    // both carry the same one. Only finishes take the turn, so the Watch's
    // other messages, which all arrive here too, cannot make one be dropped.
    let applying = false;
    // `heardAt` comes with an action drained at launch: the instant from which
    // a Watch "saved" confirmation is this finish's (it can have been buffered
    // before the finish itself was applied).
    const apply = async (a: WatchAction, heardAt?: number) => {
      const action = a.action;
      if (!completesWorkout(action)) return;
      if (applying) return;
      applying = true;
      const finishId = finishRequestId(a);
      // Tells a waiting Watch how it went, once. Nothing is sent to one that
      // is not waiting: it would not know what to make of it.
      let told = false;
      const tellWatch = (outcome: 'finished' | 'failed') => {
        const verdict = told ? null : finishVerdict(outcome, finishId);
        if (!verdict) return;
        told = true;
        pushWatchState(verdict);
      };
      try {
        const [active] = await listWorkouts({ status: 'active', limit: 1 });
        // One drained at launch (it comes with `heardAt`) reached nobody else.
        const drained = heardAt !== undefined;
        if (routeWatchFinish(action, active?.id ?? null, drained) !== 'fallback' || !active) return;

        if (action === 'discard') {
          void LiveActivity.end();
          forgetActiveWorkout();
          clearRest(active.id);
          await discardWorkout(active.id);
          notifyWatchFinished(active.id, 'discarded');
          return;
        }

        // The write first. Everything after it belongs to a workout that is
        // over, and until the write has succeeded this one is not: taking the
        // Live Activity, the rest timer and the reopen pointer away before it
        // left a workout that failed to finish running without them.
        const finishBeganAt = Date.now();
        // The one step ahead of the write: listen for the Watch's "saved"
        // message, which it sends about now and which the Health sync below
        // would otherwise start listening for too late.
        ensureWatchSaveListener();
        let summary: Awaited<ReturnType<typeof finishWorkout>>;
        try {
          summary = await finishWorkout(active.id);
        } catch {
          // Still active on the phone, with all of the above in place, and
          // resumable from Home. A waiting Watch is told, stays in the workout
          // and keeps recording. One that ended its session when Finish was
          // tapped is on its Start screen, and only a mounted workout screen
          // has the state to send it back (it does so, and restarts the
          // session, when the workout is opened).
          tellWatch('failed');
          Alert.alert(
            'Couldn’t finish workout',
            'Nothing was changed. Open the workout and try again.',
          );
          return;
        }
        // Stored: a waiting Watch can end its session and save its recording.
        tellWatch('finished');
        void LiveActivity.end();
        forgetActiveWorkout();
        clearRest(active.id);
        // The Watch ran the session, so it is the primary writer of the
        // HKWorkout; this verifies that save rather than duplicating it. A
        // Watch that waited saves only now, so the wait for it is longer.
        // An Apple Watch, that is: a Wear OS one has nowhere to save to, so
        // there the phone writes without waiting.
        const startedAt = parseServerDate(active.started_at);
        if (!Number.isNaN(startedAt)) {
          void syncFinishedWorkout(
            active.id,
            startedAt,
            finishBeganAt,
            Platform.OS === 'ios',
            heardAt ?? finishBeganAt,
            finishId != null,
            // A Wear OS watch sends what it measured instead of saving it.
            Platform.OS === 'android',
          );
        }
        saveSummary(active.id, summary);
        notifyWatchFinished(active.id);
      } catch {
        // Best-effort: a finish we couldn't apply leaves the workout active and
        // resumable, which is the state the user was already in. A Watch still
        // waiting on it keeps recording.
        //
        // Unless a workout screen is mounted. Reading the active workout is
        // what failed here, so this never learned the finish was the screen's
        // to complete, and the screen is completing it: it answers the Watch.
        if (!screenHoldsWatchFinish()) tellWatch('failed');
      } finally {
        applying = false;
      }
    };

    // Actions queued natively before any listener existed — the cold-launch case,
    // where WCSession can deliver before the JS bundle has subscribed.
    void (async () => {
      const { actions, heardAt } = await consumeWatchActions();
      for (const a of actions) await apply(a, heardAt);
    })();

    return onWatchAction((a) => void apply(a));
  }, []);
}

export default function RootLayout() {
  useLiveActivityActions();
  useWatchStart();
  useWatchFinish();
  // Phase 0: build + seed the on-device DB at startup. Nothing reads from it
  // yet (the app is still server-backed); this only guarantees it exists.
  const dbBootstrap = useLocalDbBootstrap();
  usePrFlagBackfill(dbBootstrap.ready);

  // Cache the haptic preference at startup; screens fire haptics before the
  // workout or settings screen would sync it.
  // Mirror the accent onto Watch pushes for the rest of the session.
  useEffect(() => {
    void getThemeId().then(setWatchThemeId);
  }, []);

  useEffect(() => {
    getSettings()
      .then((s) => {
        setHapticsEnabled(s.haptic_feedback);
        // Same reason: the first screen to show a weight should already know
        // the unit, rather than paint kilograms and correct itself.
        setWeightUnit(s.unit);
        // And whether sets are rated: off by default, so priming it late can
        // only ever add a rating to the screen, never flash one that is hidden.
        setEffortMode(s.effort_mode);
      })
      .catch(() => {});
  }, []);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded || !dbBootstrap.ready) {
    return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AboveNavigationBar>
      <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bg },
          }}
        >
          <Stack.Screen
            name="exercise-library"
            options={{
              presentation: 'modal',
              headerShown: false,
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="exercise/new"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="exercise/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="summary/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="workout/edit/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="routine/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="routine/view/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="health"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="import"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="measurements"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="measurement/[metric]"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="muscle-map"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="one-rep-max"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="plates"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <Stack.Screen
            name="merge-duplicates"
            options={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: color.bg },
            }}
          />
        </Stack>
      </AboveNavigationBar>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
