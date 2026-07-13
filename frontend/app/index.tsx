import { Redirect } from 'expo-router';

import { recallActiveWorkout } from '../src/lib/activeWorkout';

/**
 * Entry gate. In the pure on-device build there is no account or server, so we
 * go straight into the app — landing back in an in-progress workout if iOS
 * relaunched us for a Live Activity intent. (The Choose-Mode picker lands here
 * in Phase 1c.)
 */
export default function Index() {
  const resume = recallActiveWorkout();
  return <Redirect href={resume ? `/workout/${resume}` : '/(tabs)'} />;
}
