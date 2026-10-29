import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OWNER_ID,
  MAX_NAME,
  PROFILE_SCOPED_KEYS,
  deleteBlock,
  deriveInitials,
  filterProfiles,
  SWITCHER_SEARCH_FROM,
  switcherListScrolls,
  graphemesWith,
  exportFileStem,
  firstName,
  manageSubline,
  ownerLabel,
  parseActiveWorkout,
  profileSlug,
  referencedCustomExerciseIds,
  resolveLaunchProfile,
  scopedKey,
  normalizeInitials,
  duplicateProfileName,
  copyRoutinesSub,
  copyRoutinesLabel,
  newProfileHealthFooter,
  exercisesToCopy,
  switchBlock,
  switcherSubline,
  type ProfileRow,
} from './profiles.ts';

const now = new Date(2026, 9, 29, 12, 0, 0);
const row: ProfileRow = {
  id: 'b',
  name: 'Maria',
  initials: 'M',
  sort: 1,
  isOwner: false,
  createdAt: new Date(2025, 2, 5).getTime(),
  workoutCount: 142,
  firstWorkoutAt: new Date(2025, 2, 10).getTime(),
  lastWorkoutAt: new Date(2026, 9, 29, 8, 0, 0).getTime(),
};

test('constants', () => {
  assert.equal(OWNER_ID, 'owner');
  assert.equal(MAX_NAME, 40);
  assert.deepEqual(PROFILE_SCOPED_KEYS, [
    'ischys.weeklyWorkoutTarget',
    'ischys.bodyweightKg',
    'ischys.countWarmupsInVolume',
    'ischys.deloadState',
    'ischys.plateSetup',
    'ischys.plateSetup.lb',
  ]);
});

test('deriveInitials', () => {
  assert.equal(deriveInitials('Maria Papadaki'), 'MP');
  assert.equal(deriveInitials('Μαρία Παπαδάκη'), 'ΜΠ');
  assert.equal(deriveInitials('Ζωή'), 'Ζ');
  assert.equal(deriveInitials('   '), '');
  assert.equal(deriveInitials('🏋️ Nik'), '🏋️N');
  assert.equal(deriveInitials('anna maria de luca'), 'AL');
});

test('firstName', () => {
  assert.equal(firstName('  Maria   Papadaki '), 'Maria');
  assert.equal(firstName(' Zoe '), 'Zoe');
  assert.equal(firstName(''), '');
});

test('profileSlug', () => {
  assert.equal(profileSlug('Maria Papadaki'), 'maria-papadaki');
  assert.equal(profileSlug('Μαρία Παπαδάκη'), 'maria-papadaki');
  assert.equal(profileSlug('🏋️'), 'profile');
  assert.equal(profileSlug('  José!! '), 'jose');
  assert.equal(profileSlug(''), 'profile');
});

test('exportFileStem', () => {
  assert.equal(exportFileStem(1, 'Maria', new Date(2026, 9, 29)), 'ischys-export');
  assert.equal(exportFileStem(0, 'Maria', new Date(2026, 9, 29)), 'ischys-export');
  assert.equal(
    exportFileStem(3, 'Maria Papadaki', new Date(2026, 9, 29)),
    'ischys-maria-papadaki-2026-10-29',
  );
  assert.equal(exportFileStem(2, '🏋️', new Date(2026, 0, 5)), 'ischys-profile-2026-01-05');
});

test('scopedKey', () => {
  assert.equal(scopedKey('owner', 'ischys.bodyweightKg'), 'ischys.bodyweightKg');
  assert.equal(scopedKey('abc', 'ischys.plateSetup.lb'), 'ischys.p.abc.plateSetup.lb');
  assert.equal(scopedKey('abc', 'other'), 'ischys.p.abc.other');
});

test('switchBlock', () => {
  const base = { targetId: 'b', currentId: 'a', activeWorkoutProfileId: null, transactionOpen: false };
  assert.equal(switchBlock({ ...base, targetId: 'a' }), 'same');
  assert.equal(switchBlock({ ...base, activeWorkoutProfileId: 'a' }), 'workout');
  // Into the profile whose workout is running: the way back to it, never blocked.
  assert.equal(switchBlock({ ...base, activeWorkoutProfileId: 'b' }), null);
  assert.equal(switchBlock({ ...base, transactionOpen: true }), 'busy');
  assert.equal(switchBlock(base), null);
});

test('deleteBlock', () => {
  assert.equal(deleteBlock({ profile: { ...row, id: 'owner', isOwner: true }, activeWorkoutProfileId: null }), 'owner');
  assert.equal(deleteBlock({ profile: { ...row, id: 'b' }, activeWorkoutProfileId: 'b' }), 'workout');
  assert.equal(deleteBlock({ profile: row, activeWorkoutProfileId: null }), null);
});

test('resolveLaunchProfile', () => {
  assert.equal(resolveLaunchProfile({ registryIds: ['owner', 'b'], lastUsedId: 'b', activeWorkoutProfileId: null }), 'b');
  assert.equal(resolveLaunchProfile({ registryIds: ['owner', 'b', 'c'], lastUsedId: 'b', activeWorkoutProfileId: 'c' }), 'c');
  assert.equal(resolveLaunchProfile({ registryIds: ['owner'], lastUsedId: 'gone', activeWorkoutProfileId: 'gone' }), 'owner');
  assert.equal(resolveLaunchProfile({ registryIds: ['owner', 'b'], lastUsedId: null, activeWorkoutProfileId: null }), 'owner');
});

test('switcherSubline', () => {
  assert.equal(switcherSubline({ ...row, lastWorkoutAt: null }, now, null), 'NO WORKOUTS YET');
  assert.equal(switcherSubline(row, now, now.getTime() - 767_000), 'IN WORKOUT · 12:47');
  assert.equal(switcherSubline(row, now, now.getTime() - 3_725_000), 'IN WORKOUT · 1:02:05');
  assert.equal(switcherSubline(row, now, null), 'LAST · TODAY');
  assert.equal(
    switcherSubline({ ...row, lastWorkoutAt: new Date(2025, 9, 28, 18).getTime() }, now, null),
    'LAST · TUE 28 OCT',
  );
});

test('manageSubline', () => {
  assert.equal(manageSubline({ ...row, isOwner: true }), 'OWNER · HEALTH · WATCH');
  assert.equal(manageSubline(row), '142 WORKOUTS · SINCE MAR 2025');
  assert.equal(manageSubline({ ...row, workoutCount: 1 }), '1 WORKOUT · SINCE MAR 2025');
  assert.equal(manageSubline({ ...row, workoutCount: 0, firstWorkoutAt: null }), 'NO WORKOUTS YET');
});

test('ownerLabel', () => {
  assert.equal(ownerLabel('Athlete', 'Athlete'), "the phone's owner");
  assert.equal(ownerLabel('Vasilis', 'Athlete'), 'Vasilis');
});

test('parseActiveWorkout', () => {
  assert.deepEqual(parseActiveWorkout('w1'), { profileId: 'owner', workoutId: 'w1' });
  assert.deepEqual(parseActiveWorkout('{"profileId":"b","workoutId":"w2"}'), { profileId: 'b', workoutId: 'w2' });
  assert.equal(parseActiveWorkout(null), null);
  assert.equal(parseActiveWorkout(''), null);
  assert.equal(parseActiveWorkout('   '), null);
  assert.equal(parseActiveWorkout('{"profileId":1}'), null);
});

test('referencedCustomExerciseIds', () => {
  assert.deepEqual(referencedCustomExerciseIds(['cat1', 'cus1', 'cus1'], new Set(['cus1', 'cus2'])), ['cus1']);
});

test('graphemes fallback matches Intl.Segmenter', () => {
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const name of ['Μαρία Παπαδάκη', '🏋️ Nik', '👨‍👩‍👧 Family', 'é Ze\u0301', '👍🏽 Tone']) {
    assert.deepEqual(graphemesWith(name, null), graphemesWith(name, seg), name);
  }
  assert.equal(graphemesWith('🏋️ Nik', null)[0], '🏋️');
  assert.equal(graphemesWith('👨‍👩‍👧 F', null)[0], '👨‍👩‍👧');
});

test('filterProfiles matches a name fragment, ignoring case and accents', () => {
  const rows = [{ name: 'Μαρία Παπαδάκη' }, { name: 'Nikos Andreou' }, { name: 'José' }];
  assert.deepEqual(filterProfiles(rows, '  '), rows);
  assert.deepEqual(filterProfiles(rows, 'andr'), [rows[1]]);
  assert.deepEqual(filterProfiles(rows, 'μαρια'), [rows[0]]);
  assert.deepEqual(filterProfiles(rows, 'JOSE'), [rows[2]]);
  assert.deepEqual(filterProfiles(rows, 'zz'), []);
});

test('switcherListScrolls: a few profiles fit, ten on a 390pt phone scroll', () => {
  assert.equal(switcherListScrolls(2, 844), false);
  assert.equal(switcherListScrolls(8, 844), false);
  assert.equal(switcherListScrolls(10, 844), true);
  assert.equal(SWITCHER_SEARCH_FROM, 9);
});

test('normalizeInitials: no spaces, uppercased, at most two graphemes', () => {
  assert.equal(normalizeInitials('mp'), 'MP');
  assert.equal(normalizeInitials(' m p k'), 'MP');
  assert.equal(normalizeInitials('μπ'), 'ΜΠ');
  assert.equal(normalizeInitials('🏋️n'), '🏋️N');
  assert.equal(normalizeInitials(''), '');
});

test('duplicateProfileName ignores case and outer spaces', () => {
  const rows = [{ name: 'Vasilis' }, { name: 'Maria Papadaki' }];
  assert.equal(duplicateProfileName('  maria papadaki ', rows), 'Maria Papadaki');
  assert.equal(duplicateProfileName('Maria', rows), null);
  assert.equal(duplicateProfileName('   ', rows), null);
  assert.equal(duplicateProfileName('ΜΑΡΊΑ', [{ name: 'Μαρία' }]), 'Μαρία');
});

test('copy routines row: sub line and label (no pronouns, default owner)', () => {
  assert.equal(copyRoutinesSub(6), '6 ROUTINES · COPIES, NOT LINKED');
  assert.equal(copyRoutinesSub(1), '1 ROUTINE · COPIES, NOT LINKED');
  assert.equal(copyRoutinesLabel({ name: 'Kostas Ioannou', isOwner: true }, 'Athlete'), "Copy Kostas's routines");
  assert.equal(copyRoutinesLabel({ name: 'Athlete', isOwner: true }, 'Athlete'), "Copy the phone's owner's routines");
  assert.equal(copyRoutinesLabel({ name: 'Maria Papadaki', isOwner: false }, 'Athlete'), "Copy Maria's routines");
});

test('newProfileHealthFooter', () => {
  assert.equal(
    newProfileHealthFooter('Eleni Georgiou', 'Kostas', 'Apple Health'),
    "Eleni's workouts stay in Ischys. Apple Health and the Watch belong to Kostas.",
  );
  assert.equal(
    newProfileHealthFooter('  ', "the phone's owner", 'Apple Health'),
    "This profile's workouts stay in Ischys. Apple Health and the Watch belong to the phone's owner.",
  );
});

test('exercisesToCopy: custom rows and rows the new file lacks, once each', () => {
  const source = [
    { id: 'cat1', userId: null, isCustom: 0 },
    { id: 'cat-old', userId: null, isCustom: 0 },
    { id: 'cus1', userId: 'local', isCustom: 1 },
    { id: 'imp1', userId: null, isCustom: 1 },
  ];
  assert.deepEqual(
    exercisesToCopy(['cat1', 'cus1', 'cus1', 'cat-old', 'imp1'], source, new Set(['cat1'])),
    ['cus1', 'cat-old', 'imp1'],
  );
});
