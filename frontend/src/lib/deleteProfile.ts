/**
 * Deleting a profile (P8b, #117): its file, its SecureStore keys and its
 * registry row, switching to the owner first when it is the active one. The
 * order and what a failure leaves are in deleteProfileSequence.ts (tested
 * there).
 *
 * It lives here rather than in data/profilesRepo.ts for the same reason as
 * createProfile.ts: it needs switchProfile, which imports profilesRepo.
 */
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';

import { closeConnection, currentConnection, fileNameFor } from '../db/client';
import { profileFileExists } from '../db/sideConnection';
import { deleteProfileRow, getProfile, listProfiles } from '../data/profilesRepo';
import { OWNER_ID } from '../domain/profiles';
import { activeProfile, setActiveProfile } from './activeProfile';
import { deleteProfileWith } from './deleteProfileSequence';
import { runningWorkoutProfileId, switchProfile } from './switchProfile';

export { ProfileDeleteBlocked } from './deleteProfileSequence';

/**
 * Deletes profile `id` and everything it stored on this phone. Throws
 * `ProfileDeleteBlocked` for the owner, a profile with the running workout, or
 * a switch that was refused; nothing is deleted then.
 */
export const deleteProfile = deleteProfileWith({
  getProfile,
  activeWorkoutProfileId: runningWorkoutProfileId,
  currentProfileId: () => activeProfile().id,
  currentConnection,
  switchToOwner: () => switchProfile(OWNER_ID),
  release: (conn) => {
    // The switch closes the file it leaves; this is for when that close failed.
    try {
      closeConnection(conn);
    } catch {
      // Already closed.
    }
  },
  fileExists: profileFileExists,
  deleteFile: (id) => deleteDatabaseAsync(fileNameFor(id)),
  deleteKey: (key) => SecureStore.deleteItemAsync(key),
  deleteProfileRow,
  refreshCount: async () => {
    const rows = await listProfiles();
    setActiveProfile(activeProfile(), rows.length);
  },
  warn: (message, error) => console.warn(message, error),
});
