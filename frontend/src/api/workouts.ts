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
  insertWarmupSets,
  setSupersetGroup,
  nextSupersetGroup,
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
  setWorkoutExerciseRest,
  addWorkoutExercise,
  addWorkoutExercises,
  uploadHeartRate,
} from '../data/workoutsRepo';

export {
  listExercises,
  listExerciseUsage,
  listCategories,
  listMuscles,
  createExercise,
  getExercise,
  patchExercise,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChart,
  findDuplicateGroups,
  countDuplicateGroups,
  countExercises,
  buildManualGroup,
  mergeExercises,
  ActiveSessionError,
} from '../data/exercisesRepo';
export type {
  MergeGroupView,
  MergeMemberView,
  MergeResult,
} from '../data/exercisesRepo';

export { getProfile, listRecentRecords, getDashboard } from '../data/profileRepo';
export { getSettings, updateSettings } from '../data/settingsRepo';
export { exportData, importFile } from '../data/exportRepo';
