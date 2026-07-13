/**
 * Local persistence for the per-exercise "About" tab demo URL.
 *
 * The backend `ExerciseOut` does not (yet) surface a `demo_url` field, so we
 * also mirror the value into SecureStore keyed by the exercise id. This keeps
 * the UI populated across launches even before the server round-trips add the
 * column — and lets us fall through gracefully if the PATCH is rejected.
 */
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'ischys.exerciseDemo.';

/** Read the last-persisted demo URL for an exercise, or `null` if unset. */
export async function getDemoUrl(exerciseId: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(`${PREFIX}${exerciseId}`);
  return raw && raw.length > 0 ? raw : null;
}

/** Persist a demo URL; pass `null`/empty to clear the entry. */
export async function setDemoUrl(exerciseId: string, url: string | null): Promise<void> {
  const key = `${PREFIX}${exerciseId}`;
  if (!url) {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  await SecureStore.setItemAsync(key, url);
}
