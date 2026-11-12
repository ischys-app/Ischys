/**
 * Adding a profile (P4, #117): registers it, creates and prepares its file,
 * and optionally copies the current profile's routines into it. The order and
 * the cleanup on failure are in createProfileSequence.ts (tested there).
 *
 * It lives here rather than in data/profilesRepo.ts because it needs
 * db/bootstrap's prepareConnection, and bootstrap imports profilesRepo: putting
 * it there would make a require cycle.
 *
 * The caller switches to the new profile afterwards (`switchProfile`).
 */
import { deleteDatabaseAsync } from 'expo-sqlite';

import { closeConnection, fileNameFor, openConnection } from '../db/client';
import { prepareConnection } from '../db/bootstrap';
import { deleteProfileRow, insertProfile } from '../data/profilesRepo';
import { readRoutineCopy, writeRoutineCopy } from '../data/routinesRepo';
import { createProfileWith } from './createProfileSequence';

export const createProfile = createProfileWith({
  insertProfile,
  readCopy: readRoutineCopy,
  openConnection,
  prepareConnection,
  writeCopy: writeRoutineCopy,
  closeConnection,
  deleteFile: (id) => deleteDatabaseAsync(fileNameFor(id)),
  deleteProfileRow,
  warn: (message, error) => console.warn(message, error),
});
