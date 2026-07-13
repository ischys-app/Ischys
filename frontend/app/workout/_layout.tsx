import { Stack } from 'expo-router';

import { color } from '../../src/theme/tokens';

/** Headerless stack for the full-screen active-workout flow (outside the tabs). */
export default function WorkoutLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
      }}
    />
  );
}
