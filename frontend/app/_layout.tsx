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
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as LiveActivity from '../modules/live-activity';
import { startWorkout } from '../src/api/workouts';
import { useLocalDbBootstrap } from '../src/db/bootstrap';
import { applyPendingCardActions } from '../src/lib/liveActivityBridge';
import { onWatchAction } from '../src/lib/healthSync';
import { color } from '../src/theme/tokens';

/**
 * Live Activity taps are drained here, not in the workout screen: an intent can
 * cold-launch the app in the background, and that launch starts at the root
 * route with no workout screen mounted to receive them.
 */
function useLiveActivityActions() {
  useEffect(() => {
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
        if (a.action !== 'startEmpty' && a.action !== 'startRoutine') return;
        void (async () => {
          try {
            const w = await startWorkout(
              a.action === 'startRoutine' ? { routine_id: a.routineId } : {},
            );
            router.push(`/workout/${w.id}`);
          } catch {
            // No server / not signed in — nothing to start.
          }
        })();
      }),
    [],
  );
}

export default function RootLayout() {
  useLiveActivityActions();
  useWatchStart();
  // Phase 0: build + seed the on-device DB at startup. Nothing reads from it
  // yet (the app is still server-backed); this only guarantees it exists.
  const dbBootstrap = useLocalDbBootstrap();

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
    <SafeAreaProvider>
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
            name="routine/[id]"
            options={{
              headerShown: false,
              animation: 'slide_from_bottom',
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
        </Stack>
    </SafeAreaProvider>
  );
}
