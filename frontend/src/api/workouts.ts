/**
 * Data-access surface for the app. In the pure on-device build these are thin
 * re-exports of the local SQLite repositories (src/data/*) — the screens import
 * the same names and get the same DTO shapes; nothing hits the network.
 */

/** Equipment enum accepted when creating a custom exercise. */
export type ExerciseEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'other';

export {
  startWorkout,
  getWorkout,
  listWorkouts,
  getActivityMap,
  patchSet,
  addSetApi,
  deleteSet,
  removeWorkoutExercise,
  reorderExercises,
  discardWorkout,
  deleteWorkout,
  finishWorkout,
  saveAsRoutine,
  getPrevious,
  getPreviousNote,
  setWorkoutExerciseNote,
  addWorkoutExercise,
  uploadHeartRate,
} from '../data/workoutsRepo';

export {
  listExercises,
  listCategories,
  listMuscles,
  createExercise,
  getExercise,
  patchExercise,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChart,
} from '../data/exercisesRepo';

export { getProfile, listRecentRecords, getDashboard } from '../data/profileRepo';
export { getSettings, updateSettings, triggerSync } from '../data/settingsRepo';
export { exportData, importFile } from '../data/exportRepo';
