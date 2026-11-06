import type { StringDef } from '../translate.ts';

/** English source strings. `note` is the context handed to the translator. */
export const strings: Record<string, StringDef> = {
  'workout.defaultName': {
    en: 'Workout',
    note: 'Default title of a workout that has no name of its own. Short noun, shown as a card or screen title.',
  },
  'history.thisWeek': {
    en: 'THIS WEEK',
    note: 'History list section header for the current calendar week. Upper case in English; no case in Chinese.',
  },
  'history.lastWeek': {
    en: 'LAST WEEK',
    note: 'History list section header for the previous calendar week. Upper case in English.',
  },
  'record.bestSet': { en: 'Best Set', note: 'Personal-record category label: the heaviest single set.' },
  'record.est1rm': { en: 'Est. 1RM', note: 'Personal-record category label: estimated one-rep max. Keep 1RM untranslated.' },
  'record.bestVolume': { en: 'Best Volume', note: 'Personal-record category label: most total weight lifted in one exercise.' },
  'record.maxReps': { en: 'Max Reps', note: 'Personal-record category label: most repetitions in one set.' },
  'ago.justNow': { en: 'just now', note: 'Relative time: under 30 seconds ago.' },
  'ago.minutes': { en: '{n}m ago', note: 'Relative time: n minutes ago. Keep the {n} placeholder.' },
  'ago.hours': { en: '{n}h ago', note: 'Relative time: n hours ago. Keep the {n} placeholder.' },
  'ago.days': { en: '{n}d ago', note: 'Relative time: n days ago. Keep the {n} placeholder.' },
  // --- Workout flow and tabs (Task 5) ---
  'tabs.home': {
    en: 'Home',
    note: 'Bottom tab bar label and screen title for the dashboard tab. Max 6 characters; fixed-width tab label.',
  },
  'tabs.history': {
    en: 'History',
    note: 'Bottom tab bar label and screen title for the workout history tab. Max 8 characters; fixed-width tab label.',
  },
  'tabs.profile': {
    en: 'Profile',
    note: 'Bottom tab bar label and screen title for the profile and settings tab. Max 8 characters; fixed-width tab label.',
  },
  'tabs.profileWho': {
    en: 'Profile, {name}',
    note: 'Screen-reader label of the Profile tab when several profiles exist; {name} is the active profile first name. Not visible.',
  },
  'tabs.switchProfile': {
    en: 'Switch profile',
    note: 'Screen-reader action name on the Profile tab (long-press) that opens the profile switcher. Not visible.',
  },
  'resume.title': {
    en: 'Workout in progress',
    note: 'Title line of the floating resume bar above the tab bar on Home. Short phrase; one line.',
  },
  'resume.button': {
    en: 'Resume',
    note: 'Pill button on the resume bar. Max 6 characters; fixed-width button.',
  },
  'routineCard.view': {
    en: 'View {name}',
    note: 'Screen-reader label of a routine card; {name} is the routine name. Not visible.',
  },
  'routineCard.more': {
    en: 'More options for {name}',
    note: 'Screen-reader label of the three-dot button on a routine card; {name} is the routine name. Not visible.',
  },
  'routineCard.start': {
    en: 'Start Routine',
    note: 'Accent button on each routine card on Home. Max 14 characters; fixed-width button.',
  },
  'streak.days': {
    en: '{days}-day streak',
    note: 'Green pill beside the This week heading on Home; {days} is the number of consecutive days. Max 18 characters; fixed-width pill.',
  },
  'pr.pill': {
    en: '{count} PR',
    note: 'Green pill on a workout card counting personal records; {count} is a number. Keep PR untranslated or use the short term for personal record. Max 10 characters.',
  },
  'workoutCard.time': {
    en: 'TIME',
    note: 'Stat label on a workout card above the duration. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'workoutCard.volume': {
    en: 'VOLUME',
    note: 'Stat label on a workout card above the total volume. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'workoutCard.sets': {
    en: 'SETS',
    note: 'Stat label on a workout card above the number of sets. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'workoutCard.deleteHint': {
    en: 'Long-press to delete this workout.',
    note: 'Screen-reader hint on a workout card in History; the long-press deletes the workout. Not visible.',
  },
  'common.cancel': {
    en: 'Cancel',
    note: 'Generic Cancel button in alerts, sheets and dialogs. Max 8 characters; fixed-width button.',
  },
  'common.save': {
    en: 'Save',
    note: 'Generic Save button in sheets and dialogs. Max 8 characters; fixed-width button.',
  },
  'common.delete': {
    en: 'Delete',
    note: 'Generic Delete button in alerts, sheets and menus; destructive. Max 8 characters; fixed-width button.',
  },
  'common.loading': {
    en: 'Loading…',
    note: 'Placeholder text shown while a screen loads its data. Keep the ellipsis character.',
  },
  'home.comingSoon.title': {
    en: 'Coming soon',
    note: 'Alert title shown when a not-yet-built feature is tapped. Short phrase.',
  },
  'home.reorderComingSoon': {
    en: 'Reorder routines is not yet implemented.',
    note: 'Alert message under Coming soon, after tapping Reorder routines in the routine menu.',
  },
  'home.exerciseCount': {
    en: '{count} exercises',
    note: 'Subline under the routine name in the routine menu sheet on Home; {count} is a number. One line.',
  },
  'home.thisWeek': {
    en: 'This week',
    note: 'Large heading of the weekly summary on Home, under the date. Max 14 characters.',
  },
  'home.statWorkouts': {
    en: 'Workouts',
    note: 'Label of the workouts stat tile on Home weekly summary (value shows done / target). Max 12 characters; fixed-width tile.',
  },
  'home.statVolume': {
    en: 'Volume',
    note: 'Label of the total volume stat tile on Home weekly summary. Max 12 characters; fixed-width tile.',
  },
  'home.statSets': {
    en: 'Sets',
    note: 'Label of the sets stat tile on Home weekly summary. Max 12 characters; fixed-width tile.',
  },
  'home.statTime': {
    en: 'Time',
    note: 'Label of the training time stat tile on Home weekly summary. Max 12 characters; fixed-width tile.',
  },
  'home.hoursUnit': {
    en: 'h',
    note: 'Unit suffix after the training time value on Home weekly summary (hours, H:MM). Max 3 characters.',
  },
  'home.quickStart': {
    en: 'Quick Start',
    note: 'Section label above the Start Empty Workout button on Home. Max 16 characters.',
  },
  'home.startEmpty': {
    en: 'Start Empty Workout',
    note: 'Button on Home that starts a workout with no exercises. Max 22 characters.',
  },
  'home.myRoutines': {
    en: 'My Routines',
    note: 'Section label above the routine list on Home; a count in brackets follows. Max 16 characters.',
  },
  'home.new': {
    en: 'New',
    note: 'Small pill button on Home that creates a new routine. Max 6 characters; fixed-width pill.',
  },
  'home.explore': {
    en: 'Explore',
    note: 'Small pill button on Home that opens the exercise library. Max 8 characters; fixed-width pill.',
  },
  'home.recent': {
    en: 'Recent',
    note: 'Section label above the recent workouts list on Home. Max 12 characters.',
  },
  'home.allHistory': {
    en: 'All history',
    note: 'Text link on Home that opens the History tab. Max 12 characters.',
  },
  'home.welcome': {
    en: 'Welcome to Ischys',
    note: 'Title of the first-run empty state on Home. Keep Ischys untranslated.',
  },
  'home.welcomeSub': {
    en: 'Your training log lives on your device — nothing leaves it. Build a routine to get started, or jump straight into an empty session.',
    note: 'Body text of the first-run empty state on Home, under the welcome title. Two to three lines, about 150 characters.',
  },
  'home.createFirstRoutine': {
    en: 'Create your first routine',
    note: 'Primary button in the first-run empty state on Home. Max 26 characters; fixed-width button.',
  },
  'home.startEmptyLower': {
    en: 'Start empty workout',
    note: 'Secondary button in the first-run empty state on Home. Max 24 characters; fixed-width button.',
  },
  'home.importPrompt': {
    en: 'Coming from another app?',
    note: 'Grey lead-in sentence at the bottom of the first-run empty state on Home; the link Import your history follows it on the same line.',
  },
  'home.importLink': {
    en: 'Import your history →',
    note: 'Accent link at the bottom of the first-run empty state on Home, opens the import screen. Keep the arrow.',
  },
  'routineMenu.deleteTitle': {
    en: 'Delete routine',
    note: 'Alert title when deleting a routine from its menu. Short phrase.',
  },
  'routineMenu.deleteMessage': {
    en: 'Delete "{name}"? This cannot be undone.',
    note: 'Alert message when deleting a routine; {name} is the routine name in straight quotes.',
  },
  'routineMenu.edit': {
    en: 'Edit exercises',
    note: 'Row in the routine menu sheet that opens the routine builder. Max 24 characters.',
  },
  'routineMenu.rename': {
    en: 'Rename',
    note: 'Row in the routine menu sheet that renames the routine. Max 24 characters.',
  },
  'routineMenu.duplicate': {
    en: 'Duplicate',
    note: 'Row in the routine menu sheet that copies the routine. Max 24 characters.',
  },
  'routineMenu.reorder': {
    en: 'Reorder routines',
    note: 'Row in the routine menu sheet for reordering the routine list. Max 24 characters.',
  },
  'routineMenu.renameTitle': {
    en: 'Rename routine',
    note: 'Title of the rename dialog opened from the routine menu. Max 24 characters.',
  },
  'routineMenu.namePlaceholder': {
    en: 'Routine name',
    note: 'Placeholder in the routine name text field of the rename dialog.',
  },
  'history.deleteTitle': {
    en: 'Delete workout?',
    note: 'Alert title when deleting a workout from History.',
  },
  'history.deleteMessage': {
    en: '"{name}" and its {count} logged sets will be permanently removed. Personal records are recomputed.',
    note: 'Alert message when deleting a workout from History; {name} is the workout name, {count} the number of logged sets.',
  },
  'history.heatLabel': {
    en: 'LAST 12 WEEKS',
    note: 'Small upper-case caption of the activity heat map card on History. Upper case in English. Max 16 characters.',
  },
  'history.sessions': {
    en: '{count} sessions',
    note: 'Right side of the heat map header on History; {count} is the number of workouts in the last 12 weeks. Max 16 characters.',
  },
  'history.moreActionsHint': {
    en: 'Long-press for more actions.',
    note: 'Screen-reader hint on a workout card in History (iOS). Not visible.',
  },
  'history.editWorkout': {
    en: 'Edit workout',
    note: 'Item in the iOS long-press context menu of a workout card on History. Max 20 characters.',
  },
  'history.deleteWorkout': {
    en: 'Delete workout',
    note: 'Destructive item in the iOS long-press context menu of a workout card on History. Max 20 characters.',
  },
  'history.count': {
    en: '{count} workouts',
    note: 'Right side of the History header; total number of completed workouts. Max 16 characters.',
  },
  'history.emptyTitle': {
    en: 'No workouts yet',
    note: 'Title of the History empty state.',
  },
  'history.emptySub': {
    en: 'Every session you finish lands here — with volume, PRs, and a 12-week activity map.',
    note: 'Body text of the History empty state. Two lines, about 80 characters. PR means personal record.',
  },
  'history.emptyCta': {
    en: 'Start your first workout',
    note: 'Button in the History empty state that starts a workout. Max 24 characters; fixed-width button.',
  },
  'profile.trainingSince': {
    en: '{place} · training since {date}',
    note: 'Profile subtitle with location and start month; {place} is the free-text location, {date} a month and year. One line.',
  },
  'profile.trainingSinceOnly': {
    en: 'training since {date}',
    note: 'Profile subtitle when no location is set; {date} is a month and year. Lower case in English. One line.',
  },
  'profile.statWorkouts': {
    en: 'WORKOUTS',
    note: 'Label of the total workouts stat cell on Profile. Upper case in English. Max 16 characters; fixed-width cell.',
  },
  'profile.statThisYear': {
    en: 'THIS YEAR',
    note: 'Label of the workouts-this-year stat cell on Profile. Upper case in English. Max 16 characters; fixed-width cell.',
  },
  'profile.statVolume': {
    en: 'VOLUME LIFTED',
    note: 'Label of the lifetime volume stat cell on Profile. Upper case in English. Max 16 characters; fixed-width cell.',
  },
  'profile.statStreak': {
    en: 'CURRENT STREAK',
    note: 'Label of the current streak stat cell on Profile. Upper case in English. Max 16 characters; fixed-width cell.',
  },
  'profile.weeksUnit': {
    en: 'wk',
    note: 'Unit suffix after the current streak value on Profile (weeks). Max 3 characters.',
  },
  'profile.nameLabel': {
    en: 'Your name',
    note: 'Screen-reader label of the profile name text field on Profile. Not visible.',
  },
  'profile.editName': {
    en: 'Edit your name',
    note: 'Screen-reader label of the profile name on Profile; tapping it edits the name. Not visible.',
  },
  'profile.barsLabel': {
    en: 'WORKOUTS / WEEK · {year}',
    note: 'Caption of the weekly bar chart card on Profile; {year} is a four-digit year. Upper case in English. Max 28 characters.',
  },
  'profile.barsAvg': {
    en: 'avg {value}',
    note: 'Right side of the weekly bar chart header on Profile; {value} is a number with one decimal. Max 12 characters.',
  },
  'profile.measurements': {
    en: 'MEASUREMENTS',
    note: 'Section label above the measurements card on Profile. Upper case in English. Max 16 characters.',
  },
  'profile.measurementsNone': {
    en: 'Nothing logged yet',
    note: 'Title of the measurements card on Profile when no measurement exists. One line.',
  },
  'profile.measurementsLatest': {
    en: 'Latest',
    note: 'Title of the measurements card on Profile when measurements exist. One word.',
  },
  'profile.measurementsHint': {
    en: 'Waist, arms, body fat and more',
    note: 'Subline of the empty measurements card on Profile. One line.',
  },
  'profile.muscleMap': {
    en: 'MUSCLE MAP',
    note: 'Section label above the muscle map card on Profile. Upper case in English. Max 16 characters.',
  },
  'profile.last7': {
    en: 'Last 7 days',
    note: 'Title of the muscle map card on Profile. Max 16 characters.',
  },
  'profile.allTrained': {
    en: 'Everything has had work',
    note: 'Subline of the muscle map card on Profile when every muscle group was trained in the last 7 days. One line.',
  },
  'profile.notTrained': {
    en: '{count} not trained · {names}',
    note: 'Subline of the muscle map card on Profile; {count} is how many muscle groups were not trained in 7 days, {names} up to three of them joined by commas. One line.',
  },
  'profile.recentRecords': {
    en: 'RECENT RECORDS',
    note: 'Section label above the personal records list on Profile. Upper case in English. Max 20 characters.',
  },
  'profile.noRecords': {
    en: 'No records yet — finish a workout to log your first PR.',
    note: 'Empty state of the personal records list on Profile. PR means personal record.',
  },
  'profile.tools': {
    en: 'TOOLS',
    note: 'Section label above the calculators list on Profile. Upper case in English. Max 12 characters.',
  },
  'profile.oneRmCalc': {
    en: '1RM calculator',
    note: 'Row title on Profile that opens the one-rep-max calculator. Keep 1RM untranslated. Max 20 characters.',
  },
  'profile.oneRmSub': {
    en: 'Estimate from a set',
    note: 'Row subtitle under the 1RM calculator row on Profile. Max 28 characters.',
  },
  'profile.plateCalc': {
    en: 'Plate calculator',
    note: 'Row title on Profile that opens the barbell plate calculator. Max 20 characters.',
  },
  'profile.plateSub': {
    en: 'Bar and plates',
    note: 'Row subtitle under the plate calculator row on Profile. Max 28 characters.',
  },
  'profile.onDevice': {
    en: 'On this device · not synced',
    note: 'Title of the storage status card at the bottom of Profile. One line.',
  },
  'profile.backupIos': {
    en: 'Backs up with iCloud',
    note: 'Subtitle of the storage status card on Profile on iPhone. Keep iCloud untranslated.',
  },
  'profile.backupAndroid': {
    en: 'Backs up with your Google account',
    note: 'Subtitle of the storage status card on Profile on Android.',
  },
  'profile.switchCurrent': {
    en: 'Switch profile, current {name}',
    note: 'Screen-reader label of the profile name button in the Profile header when several profiles exist; {name} is the current profile. Not visible.',
  },
  'profile.healthOffLabel': {
    en: '{name} off',
    note: 'Screen-reader label of the grey Health pill in the Profile header; {name} is the platform health app name (Apple Health or Health Connect). Not visible.',
  },
  'profile.healthOffChip': {
    en: 'Health · off',
    note: 'Grey pill in the Profile header for profiles that are not the owner. Max 14 characters; fixed-width pill.',
  },
  'profile.healthOnLabel': {
    en: '{name} connected',
    note: 'Screen-reader label of the green Health pill in the Profile header; {name} is the platform health app name. Not visible.',
  },
  'profile.healthOnChip': {
    en: 'Health · connected',
    note: 'Green pill in the Profile header when Health is connected. Max 18 characters; fixed-width pill.',
  },
  'profile.settingsLabel': {
    en: 'Settings',
    note: 'Screen-reader label of the gear button in the Profile header that opens Settings. Not visible.',
  },
  'workout.liveOffTitle': {
    en: 'Live Activities are off',
    note: 'Alert title on the workout screen when Live Activities are disabled in system settings.',
  },
  'workout.liveOffMessage': {
    en: 'Turn on Live Activities for Ischys in Settings to see your rest timer on the Lock Screen.',
    note: 'Alert message under Live Activities are off. Keep Ischys untranslated.',
  },
  'workout.openSettings': {
    en: 'Open Settings',
    note: 'Alert button that opens the system Settings app. Max 16 characters; fixed-width button.',
  },
  'workout.finishFailedTitle': {
    en: 'Couldn’t finish workout',
    note: 'Alert title when finishing a workout fails. Keep the typographic apostrophe.',
  },
  'workout.supersetNone': {
    en: 'None · then {tag}',
    note: 'Rest label on an earlier superset partner: rest is skipped here and happens after {tag} (like A2). Max 18 characters; sits in an exercise row.',
  },
  'workout.supersetHeader': {
    en: 'SUPERSET {letter} · ROUND {current} OF {rounds}',
    note: 'Header above a superset group; {letter} is the group letter (A, B), {current} and {rounds} are numbers. Upper case in English. One line, max 36 characters.',
  },
  'workout.statusActive': {
    en: 'In progress',
    note: 'Status word in the workout header status line, followed by the clock (In progress · 12:30). Max 14 characters.',
  },
  'workout.keypadBackLabel': {
    en: 'Back to the keypad bar',
    note: 'Screen-reader label of the Back key on the keyboard bar while rating a set. Not visible.',
  },
  'workout.keypadBack': {
    en: 'Back',
    note: 'Key on the keyboard accessory bar while rating a set; returns to the plates/RPE bar. Max 8 characters; fixed-width key.',
  },
  'workout.clearRating': {
    en: 'Clear rating',
    note: 'Key on the keyboard accessory bar that clears the RPE/RIR rating of a set; also its screen-reader label. Max 14 characters; fixed-width key.',
  },
  'workout.plateCalcLabel': {
    en: 'Plate calculator',
    note: 'Screen-reader label of the Plates key on the keyboard bar. Not visible.',
  },
  'workout.plates': {
    en: 'Plates',
    note: 'Key on the keyboard accessory bar that opens the plate calculator. Max 8 characters; fixed-width key.',
  },
  'workout.rateSetLabel': {
    en: 'Rate this set',
    note: 'Screen-reader label of the RPE/RIR key on the keyboard bar. Not visible.',
  },
  'workout.hideKeyboard': {
    en: 'Hide keyboard',
    note: 'Screen-reader label of the Done key on the keyboard bar. Not visible.',
  },
  'workout.keyboardDone': {
    en: 'Done',
    note: 'Key on the keyboard accessory bar that dismisses the keyboard. Max 8 characters; fixed-width key.',
  },
  'workout.allDone': {
    en: 'All sets done',
    note: 'Title of the bottom sheet shown when every set of the workout is logged.',
  },
  'workout.doneStat_one': {
    en: '{count} set · {volume} {unit} · {clock}',
    note: 'Stat line on the All sets done sheet, singular: {count} set, {volume} total weight, {unit} kg or lb, {clock} elapsed time. One line.',
  },
  'workout.doneStat_other': {
    en: '{count} sets · {volume} {unit} · {clock}',
    note: 'Stat line on the All sets done sheet, plural: {count} sets, {volume} total weight, {unit} kg or lb, {clock} elapsed time. One line.',
  },
  'workout.finishButton': {
    en: 'Finish Workout',
    note: 'Primary button on the All sets done sheet that ends the workout. Max 20 characters; fixed-width button.',
  },
  'workout.addAnother': {
    en: 'Add another exercise',
    note: 'Secondary button on the All sets done sheet that opens the exercise library. Max 24 characters; fixed-width button.',
  },
  'common.off': {
    en: 'Off',
    note: 'Generic Off label for a disabled option such as the rest timer. Max 6 characters.',
  },
  'effort.last': {
    en: 'last {value}',
    note: 'Under PREV on a set row: last session rating; {value} is a rating such as @8 or 2 RIR. Lower case in English. Max 14 characters; fixed-width column.',
  },
  'effort.saved': {
    en: '{value} saved',
    note: 'Rest bar text after rating a set; {value} is a rating such as @8 or 2 RIR. Max 20 characters.',
  },
  'effort.askRir': {
    en: 'SET {badge} · REPS LEFT?',
    note: 'Question in the rest bar after finishing a set when the effort scale is RIR; {badge} is the set number or letter. Upper case in English. Max 26 characters; one line.',
  },
  'effort.askRpe': {
    en: 'SET {badge} · HOW HARD?',
    note: 'Question in the rest bar after finishing a set when the effort scale is RPE; {badge} is the set number or letter. Upper case in English. Max 26 characters; one line.',
  },
  'effort.hintRir': {
    en: '0 = NOTHING LEFT',
    note: 'Hint in the rest bar teaching the RIR scale. Upper case in English. Max 20 characters; one line.',
  },
  'effort.hintRpe': {
    en: '8 = 2 REPS LEFT',
    note: 'Hint in the rest bar teaching the RPE scale. Upper case in English. Max 20 characters; one line.',
  },
  'effort.nothingLeft': {
    en: 'NOTHING LEFT',
    note: 'Effort meaning at the hardest end of the scale, shown while scrubbing the rest bar and in the effort sheet. Upper case in English. Max 16 characters.',
  },
  'effort.fivePlus': {
    en: '5+ REPS LEFT',
    note: 'Effort meaning, five or more reps left. Upper case in English. Max 16 characters.',
  },
  'effort.range': {
    en: '{from}–{to} REPS LEFT',
    note: 'Effort meaning for a half step, e.g. 1–2 REPS LEFT; keep the en dash. Upper case in English. Max 22 characters.',
  },
  'effort.oneRep': {
    en: '1 REP LEFT',
    note: 'Effort meaning, exactly one rep left. Upper case in English. Max 16 characters.',
  },
  'effort.nReps': {
    en: '{n} REPS LEFT',
    note: 'Effort meaning, several reps left; {n} is 2, 3 or 4. Upper case in English. Max 16 characters.',
  },
  'effort.meaning': {
    en: '@{rpe} · {text}',
    note: 'Effort meaning while scrubbing the RPE scale; {rpe} is the number, {text} one of the REPS LEFT phrases. Keep the @ and the dot.',
  },
  'effort.word.0': {
    en: 'zero',
    note: 'The number 0 spelled out, used inside the effort sentence.',
  },
  'effort.word.1': {
    en: 'one',
    note: 'The number 1 spelled out, used inside the effort sentence.',
  },
  'effort.word.2': {
    en: 'two',
    note: 'The number 2 spelled out, used inside the effort sentence.',
  },
  'effort.word.3': {
    en: 'three',
    note: 'The number 3 spelled out, used inside the effort sentence.',
  },
  'effort.word.4': {
    en: 'four',
    note: 'The number 4 spelled out, used inside the effort sentence.',
  },
  'effort.word.5': {
    en: 'five',
    note: 'The number 5 spelled out, used inside the effort sentence.',
  },
  'effort.tank.none': {
    en: 'nothing left',
    note: 'Part of the effort sentence in the effort sheet: no reps left. Lower case in English; inserted into the sentence.',
  },
  'effort.tank.fivePlus': {
    en: 'five or more reps left',
    note: 'Part of the effort sentence in the effort sheet. Lower case in English; inserted into the sentence.',
  },
  'effort.tank.half': {
    en: 'maybe one rep left',
    note: 'Part of the effort sentence in the effort sheet. Lower case in English; inserted into the sentence.',
  },
  'effort.tank.range': {
    en: 'about {from} to {to} reps left',
    note: 'Part of the effort sentence; {from} and {to} are spelled-out numbers. Lower case in English; inserted into the sentence.',
  },
  'effort.tank.one': {
    en: 'about one rep left',
    note: 'Part of the effort sentence in the effort sheet. Lower case in English; inserted into the sentence.',
  },
  'effort.tank.many': {
    en: 'about {n} reps left',
    note: 'Part of the effort sentence; {n} is a spelled-out number. Lower case in English; inserted into the sentence.',
  },
  'effort.sentence': {
    en: '{label} · {tank} in the tank.',
    note: 'Full sentence in the effort sheet; {label} is a rating such as @8 or 2 RIR, {tank} a phrase like about two reps left. Keep the dot and period.',
  },
  'effort.unratedRpe': {
    en: '8 means about two reps left in the tank.',
    note: 'Explanation in the effort sheet before a set is rated, RPE scale.',
  },
  'effort.unratedRir': {
    en: '0 means nothing left in the tank.',
    note: 'Explanation in the effort sheet before a set is rated, RIR scale.',
  },
  'emptyWorkout.title': {
    en: 'Empty workout',
    note: 'Title of the empty state on the workout screen before any exercise is added.',
  },
  'emptyWorkout.sub': {
    en: 'Add your first exercise to start logging. Rest timers and previous-set references kick in automatically.',
    note: 'Body text of the workout empty state. Two or three lines, about 100 characters.',
  },
  'effort.rirName': {
    en: 'Reps in reserve',
    note: 'Screen-reader name of the RIR effort scale control. Not visible.',
  },
  'effort.rpeName': {
    en: 'Rate of perceived exertion',
    note: 'Screen-reader name of the RPE effort scale control. Not visible.',
  },
  'effort.notRated': {
    en: 'Not rated',
    note: 'Screen-reader value of the effort scale when the set has no rating. Not visible.',
  },
  'effort.sheetTitle': {
    en: '{name} · SET {badge}',
    note: 'Title of the effort sheet; {name} is the exercise name in upper case without its bracketed suffix, {badge} the set number or letter. Max 36 characters; one line.',
  },
  'effort.easier': {
    en: 'EASIER',
    note: 'Left end label under the effort scale in the effort sheet. Upper case in English. Max 12 characters; fixed-width.',
  },
  'effort.nothingLeftEnd': {
    en: 'NOTHING LEFT',
    note: 'Right end label under the effort scale in the effort sheet. Upper case in English. Max 14 characters; fixed-width.',
  },
  'restBar.rest': {
    en: 'REST',
    note: 'Small kicker above the countdown in the rest bar. Upper case in English. Max 6 characters; fixed-width.',
  },
  'restBar.skip': {
    en: 'Skip',
    note: 'Button in the rest bar that ends the rest. Max 6 characters; fixed-width button.',
  },
  'restBar.timer': {
    en: 'Rest Timer',
    note: 'Label of the idle rest bar button and of the rest timer row/sheet title. Max 14 characters.',
  },
  'restBar.tapToStart': {
    en: '— tap to start',
    note: 'Grey hint after Rest Timer in the idle rest bar. Keep the leading dash. Max 18 characters.',
  },
  'workout.exerciseMeta': {
    en: '{equipment} · {seconds}s rest',
    note: 'Under an exercise name in the workout card and superset sheet; {equipment} is the equipment name, {seconds} the rest time in seconds. Max 30 characters.',
  },
  'workoutEdit.type.normal': {
    en: 'normal',
    note: 'Set type word in the WAS cell of Edit Workout (was normal). Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.type.warmup': {
    en: 'warm-up',
    note: 'Set type word in the WAS cell of Edit Workout (was warm-up). Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.type.drop': {
    en: 'drop',
    note: 'Set type word in the WAS cell of Edit Workout (was drop). Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.type.failure': {
    en: 'failure',
    note: 'Set type word in the WAS cell of Edit Workout (was failure). Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.noSetHint': {
    en: 'Add a set, or remove this exercise.',
    note: 'Red hint on an exercise card in Edit Workout that has no sets. One line.',
  },
  'workoutEdit.ssRounds_one': {
    en: '· {count} ROUND',
    note: 'Note after SUPERSET A in Edit Workout, singular; keep the leading dot. Upper case in English. Max 20 characters.',
  },
  'workoutEdit.ssRounds_other': {
    en: '· {count} ROUNDS',
    note: 'Note after SUPERSET A in Edit Workout, plural; keep the leading dot. Upper case in English. Max 20 characters.',
  },
  'workoutEdit.ssEndsWhenSaved': {
    en: '· ENDS WHEN SAVED',
    note: 'Note after SUPERSET A in Edit Workout when saving will dissolve the superset. Keep the leading dot. Upper case in English. Max 22 characters.',
  },
  'workoutEdit.ssAfterSave': {
    en: '· {count} AFTER SAVE',
    note: 'Note after SUPERSET A in Edit Workout: how many exercises remain in the superset after saving. Keep the leading dot. Upper case in English. Max 22 characters.',
  },
  'workoutEdit.removedLabel_one': {
    en: 'REMOVED · {count} SET',
    note: 'Label on a removed exercise row in Edit Workout, singular. Upper case in English. Max 22 characters.',
  },
  'workoutEdit.removedLabel_other': {
    en: 'REMOVED · {count} SETS',
    note: 'Label on a removed exercise row in Edit Workout, plural. Upper case in English. Max 22 characters.',
  },
  'workoutEdit.ssHeader': {
    en: 'SUPERSET {letter}',
    note: 'Header above a superset group in Edit Workout; {letter} is A, B... Upper case in English. Max 18 characters.',
  },
  'workoutEdit.was.needsReps': {
    en: 'needs reps',
    note: 'WAS cell text in Edit Workout for a new set without reps. Lower case in English. Max 10 characters; fixed-width cell.',
  },
  'workoutEdit.was.new': {
    en: 'new',
    note: 'WAS cell text in Edit Workout for a set added in this edit. Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.was.nowDone': {
    en: 'now done',
    note: 'WAS cell text in Edit Workout for a set just marked done. Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.was.notDone': {
    en: 'not done',
    note: 'WAS cell text in Edit Workout for a set that was never done. Lower case in English. Max 9 characters; fixed-width cell.',
  },
  'workoutEdit.was.value': {
    en: 'was {value}',
    note: 'WAS cell text in Edit Workout showing the saved value; {value} is like 60 × 6 or a set type word. Lower case in English. Max 12 characters; fixed-width cell.',
  },
  'workoutEdit.metric.best_set': {
    en: 'HEAVIEST WEIGHT',
    note: 'Record metric label on the Save changes sheet in Edit Workout. Upper case in English. Max 18 characters.',
  },
  'workoutEdit.metric.est_1rm': {
    en: 'EST. 1RM',
    note: 'Record metric label on the Save changes sheet in Edit Workout. Keep 1RM untranslated. Upper case in English. Max 18 characters.',
  },
  'workoutEdit.metric.max_reps': {
    en: 'MOST REPS',
    note: 'Record metric label on the Save changes sheet in Edit Workout. Upper case in English. Max 18 characters.',
  },
  'workoutEdit.metric.best_volume': {
    en: 'BEST VOLUME',
    note: 'Record metric label on the Save changes sheet in Edit Workout. Upper case in English. Max 18 characters.',
  },
  'workoutEdit.note.new': {
    en: 'New record',
    note: 'Note under a record row on the Save changes sheet: the edit sets a new record.',
  },
  'workoutEdit.note.none': {
    en: 'No earlier record',
    note: 'Note under a record row on the Save changes sheet: nothing to fall back to.',
  },
  'workoutEdit.note.from': {
    en: 'From {date}',
    note: 'Note under a record row on the Save changes sheet: the record falls back to a result from {date} (day and month).',
  },
  'workoutEdit.note.history': {
    en: 'From your history',
    note: 'Note under a record row on the Save changes sheet: the record falls back to an older result.',
  },
  'workoutEdit.prefix.est1rm': {
    en: 'Est. 1RM',
    note: 'Prefix before a value in the record line on an exercise card in Edit Workout. Keep 1RM untranslated.',
  },
  'workoutEdit.prefix.volume': {
    en: 'Volume',
    note: 'Prefix before a value in the record line on an exercise card in Edit Workout.',
  },
  'workoutEdit.line.newRecord': {
    en: '{value} is a new record.',
    note: 'Neutral line on an exercise card in Edit Workout; {value} is a result like 68 × 5.',
  },
  'workoutEdit.line.wasRecordNone': {
    en: '{value} was a record. No earlier record.',
    note: 'Neutral line on an exercise card in Edit Workout; {value} is a result like 68 × 5.',
  },
  'workoutEdit.line.fallsBack': {
    en: '{value} was a record. Falls back to {to}',
    note: 'Neutral line on an exercise card in Edit Workout when the record falls back without a known date; {value} and {to} are results like 68 × 5.',
  },
  'workoutEdit.line.fallsBackOn': {
    en: '{value} was a record. Falls back to {to} · {date}',
    note: 'Neutral line on an exercise card in Edit Workout; {value} and {to} are results, {date} a day and month. Keep the middle dot.',
  },
  'editWhen.date': {
    en: 'Date',
    note: 'Row label in the Date & time sheet of Edit Workout. Max 10 characters; fixed-width row label.',
  },
  'editWhen.start': {
    en: 'Start',
    note: 'Row label in the Date & time sheet of Edit Workout (start time). Max 10 characters; fixed-width row label.',
  },
  'editWhen.duration': {
    en: 'Duration',
    note: 'Row label in the Date & time sheet of Edit Workout. Max 10 characters; fixed-width row label.',
  },
  'editWhen.title': {
    en: 'Date & time',
    note: 'Title of the Date & time sheet in Edit Workout.',
  },
  'editWhen.body': {
    en: 'Changing the date moves this workout in History.',
    note: 'Body text under the Date & time sheet title in Edit Workout.',
  },
  'common.done': {
    en: 'Done',
    note: 'Generic Done button in sheets and dialogs. Max 8 characters; fixed-width button.',
  },
  'editWhen.day': {
    en: 'Day',
    note: 'Screen-reader label of the day wheel in Edit Workout. Not visible.',
  },
  'editWhen.month': {
    en: 'Month',
    note: 'Screen-reader label of the month wheel in Edit Workout. Not visible.',
  },
  'editWhen.year': {
    en: 'Year',
    note: 'Screen-reader label of the year wheel in Edit Workout. Not visible.',
  },
  'editWhen.hour': {
    en: 'Hour',
    note: 'Screen-reader label of the hour wheel in Edit Workout. Not visible.',
  },
  'editWhen.minute': {
    en: 'Minute',
    note: 'Screen-reader label of the minute wheel in Edit Workout. Not visible.',
  },
  'editWhen.hours': {
    en: 'Hours',
    note: 'Screen-reader label of the duration hours wheel in Edit Workout. Not visible.',
  },
  'editWhen.minutes': {
    en: 'Minutes',
    note: 'Screen-reader label of the duration minutes wheel in Edit Workout. Not visible.',
  },
  'editWhen.hUnit': {
    en: 'h',
    note: 'Unit label beside the duration hours wheel in Edit Workout. One character.',
  },
  'editWhen.minUnit': {
    en: 'min',
    note: 'Unit label beside the duration minutes wheel in Edit Workout. Max 3 characters.',
  },
  'editWhen.ends': {
    en: 'ENDS {time}',
    note: 'Derived end time under the wheels in Edit Workout; {time} is HH:MM. Upper case in English. Max 18 characters.',
  },
  'editWhen.endsWas': {
    en: 'ENDS {time} · WAS {was}',
    note: 'Derived end time under the wheels in Edit Workout when it moved; {time} and {was} are HH:MM. Upper case in English. Max 28 characters.',
  },
  'editSave.title': {
    en: 'Save changes?',
    note: 'Title of the confirmation sheet shown when saving an edit moves personal records.',
  },
  'editSave.body': {
    en: 'This changes your records. The new values come from your full history.',
    note: 'Body text of the Save changes sheet in Edit Workout.',
  },
  'editSave.primary': {
    en: 'Save changes',
    note: 'Primary button of the Save changes sheet. Max 20 characters; fixed-width button.',
  },
  'editSave.keepEditing': {
    en: 'Keep editing',
    note: 'Secondary button of the Save changes and Discard changes sheets. Max 20 characters; fixed-width button.',
  },
  'editDiscard.title': {
    en: 'Discard changes?',
    note: 'Title of the confirmation sheet when leaving Edit Workout with unsaved changes.',
  },
  'editDiscard.one': {
    en: '1 change',
    note: 'Count phrase at the start of the discard body when exactly one change is pending.',
  },
  'editDiscard.many': {
    en: '{count} changes',
    note: 'Count phrase at the start of the discard body for several pending changes; {count} is a number.',
  },
  'editDiscard.body': {
    en: '{what} to this workout won’t be saved. The workout stays as it was.',
    note: 'Body text of the Discard changes sheet; {what} is the count phrase (1 change / 3 changes). Keep the typographic apostrophe.',
  },
  'editDiscard.primary': {
    en: 'Discard changes',
    note: 'Destructive button of the Discard changes sheet. Max 20 characters; fixed-width button.',
  },
  'exerciseMenu.reorder': {
    en: 'Reorder exercises',
    note: 'Item in the exercise overflow menu on the workout screen; also its screen-reader label. Max 24 characters; menu width.',
  },
  'exerciseMenu.replace': {
    en: 'Replace exercise',
    note: 'Item in the exercise overflow menu; also its screen-reader label. Max 24 characters; menu width.',
  },
  'exerciseMenu.leaveSuperset': {
    en: 'Leave superset',
    note: 'Item in the exercise overflow menu when the exercise is in a superset; also its screen-reader label. Max 24 characters; menu width.',
  },
  'exerciseMenu.supersetWith': {
    en: 'Superset with…',
    note: 'Item in the exercise overflow menu that opens the superset partner picker; also the title of that sheet. Keep the ellipsis. Max 24 characters.',
  },
  'exerciseMenu.supersetLabel': {
    en: 'Superset with another exercise',
    note: 'Screen-reader label of the Superset with item. Not visible.',
  },
  'exerciseMenu.remove': {
    en: 'Remove exercise',
    note: 'Destructive item in the exercise overflow menu; also its screen-reader label. Max 24 characters; menu width.',
  },
  'removedRow.undoLabel': {
    en: 'Undo removing {name}',
    note: 'Screen-reader label of the Undo button on a removed exercise row; {name} is the exercise name. Not visible.',
  },
  'reorder.title': {
    en: 'Reorder Exercises',
    note: 'Title of the full-screen exercise reorder overlay.',
  },
  'reorder.doneLabel': {
    en: 'Done reordering',
    note: 'Screen-reader label of the Done button in the reorder overlay. Not visible.',
  },
  'supersetSheet.pairs': {
    en: 'Pairs with {name}',
    note: 'Subtitle of the superset partner picker; {name} is the exercise being paired. One line.',
  },
  'supersetSheet.needPartner': {
    en: 'Add another exercise to this workout first — a superset needs a partner.',
    note: 'Empty state of the superset partner picker when the workout has a single exercise.',
  },
  'supersetSheet.already': {
    en: ' · already in a superset',
    note: 'Suffix after the exercise meta line in the superset picker for exercises already grouped. Keep the leading dot.',
  },
  'supersetSheet.pick': {
    en: 'Pick a partner',
    note: 'Disabled state of the confirm button in the superset picker. Max 20 characters; fixed-width button.',
  },
  'supersetSheet.make': {
    en: 'Make superset',
    note: 'Confirm button in the superset picker. Max 20 characters; fixed-width button.',
  },
  'warmup.title': {
    en: 'Warm-up',
    note: 'Title of the warm-up sheet and label of the Warm-up button on an exercise card. Max 12 characters; fixed-width button.',
  },
  'warmup.sub': {
    en: 'Ramps to your first working set · {weight} {unit} × {reps}',
    note: 'Subtitle of the warm-up sheet; {weight} {unit} × {reps} is the first working set, like 60 kg × 8. One to two lines.',
  },
  'warmup.colSet': {
    en: 'SET',
    note: 'Column header in the warm-up sheet table. Upper case in English. Max 5 characters; fixed-width column.',
  },
  'warmup.colWeightReps': {
    en: '{unit} × REPS',
    note: 'Column header in the warm-up sheet table; {unit} is KG or LB. Upper case in English. Max 14 characters; fixed-width column.',
  },
  'warmup.colPlates': {
    en: 'PLATES / SIDE',
    note: 'Column header in the warm-up sheet table for barbell plates per side. Upper case in English. Max 14 characters; fixed-width column.',
  },
  'warmup.bar': {
    en: 'bar',
    note: 'Plate cell in the warm-up sheet when only the empty bar is lifted; also percent cell. Lower case in English. Max 6 characters.',
  },
  'warmup.light': {
    en: 'Nothing to ramp — the working weight is already light.',
    note: 'Empty state of the warm-up sheet when the working weight needs no ramp.',
  },
  'warmup.sets': {
    en: 'Sets',
    note: 'Label before the 1-2-3-4 selector in the warm-up sheet. Max 8 characters.',
  },
  'warmup.nothing': {
    en: 'Nothing to insert',
    note: 'Disabled state of the insert button in the warm-up sheet. Max 24 characters; fixed-width button.',
  },
  'warmup.insert_one': {
    en: 'Insert {count} warm-up set',
    note: 'Insert button in the warm-up sheet, singular. Max 26 characters; fixed-width button.',
  },
  'warmup.insert_other': {
    en: 'Insert {count} warm-up sets',
    note: 'Insert button in the warm-up sheet, plural. Max 28 characters; fixed-width button.',
  },
  'workoutHeader.discardTitle': {
    en: 'Discard this workout?',
    note: 'Title of the confirmation sheet when discarding the running workout.',
  },
  'workoutHeader.discardBody': {
    en: 'Every set you\'ve logged, plus your time and volume, is deleted for good. This can\'t be undone, and nothing is saved to your history.',
    note: 'Body text of the discard workout confirmation sheet. Straight apostrophes.',
  },
  'workoutHeader.discard': {
    en: 'Discard workout',
    note: 'Destructive button of the discard sheet; also screen-reader label of the trash button in the workout header. Max 20 characters; fixed-width button.',
  },
  'workoutHeader.keepGoing': {
    en: 'Keep going',
    note: 'Secondary button of the discard sheet that returns to the workout. Max 20 characters; fixed-width button.',
  },
  'workoutHeader.minimise': {
    en: 'Minimise workout',
    note: 'Screen-reader label of the back button in the workout header. Not visible.',
  },
  'workoutHeader.minimiseHint': {
    en: 'Keeps it running and goes back',
    note: 'Screen-reader hint of the back button in the workout header. Not visible.',
  },
  'workoutHeader.startedBy': {
    en: '· STARTED {time}',
    note: 'Line after the profile first name in the workout header when several profiles exist; {time} is HH:MM. Keep the leading dot. Upper case in English. Max 18 characters.',
  },
  'workoutHeader.finish': {
    en: 'Finish',
    note: 'Button in the workout header that ends the workout. Max 8 characters; fixed-width button.',
  },
  'workoutHeader.time': {
    en: 'TIME',
    note: 'Stat label in the workout header strip. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'workoutHeader.volume': {
    en: 'VOLUME',
    note: 'Stat label in the workout header strip. Upper case in English. Max 7 characters; fixed-width column.',
  },
  'workoutHeader.sets': {
    en: 'SETS',
    note: 'Stat label in the workout header strip. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'workoutHeader.hr': {
    en: 'HR',
    note: 'Stat label in the workout header strip for live heart rate from the Watch. Upper case in English. Max 4 characters; fixed-width column.',
  },
  'workoutHeader.cal': {
    en: 'CAL',
    note: 'Stat label in the workout header strip for active calories from the Watch. Upper case in English. Max 4 characters; fixed-width column.',
  },
  'plateSheet.title': {
    en: 'Plates',
    note: 'Title of the plate calculator sheet on the workout screen. Max 12 characters.',
  },
  'plateSheet.bar': {
    en: '{weight} {unit} bar',
    note: 'Chip in the plate sheet header showing the configured bar weight; {weight} is a number, {unit} kg or lb. Max 20 characters; tapping opens the plate setup.',
  },
  'plateSheet.lighter': {
    en: 'Lighter than the bar',
    note: 'Title of the plate sheet warning when the target weight is below the bar.',
  },
  'plateSheet.barAlone': {
    en: 'The bar alone is {weight} {unit}.',
    note: 'Body of the plate sheet warning; {weight} {unit} is the bar weight.',
  },
  'plateSheet.switchBar': {
    en: 'Switch bar',
    note: 'Link in the plate sheet warning that opens the plate setup. Max 14 characters.',
  },
  'plateSheet.cantLoad': {
    en: '{weight} {unit} can\'t be loaded exactly.',
    note: 'First sentence of the plate sheet warning; {weight} {unit} is the target. The next sentence follows after a space.',
  },
  'plateSheet.steps': {
    en: 'The smallest plate is {plate} {unit}, so the weight goes up in {step} {unit} steps.',
    note: 'Second sentence of the plate sheet warning when plates exist; {plate} and {step} are numbers, {unit} kg or lb.',
  },
  'plateSheet.noPlates': {
    en: 'There are no plates set up yet.',
    note: 'Second sentence of the plate sheet warning when no plates are configured.',
  },
  'plateSheet.lighterTag': {
    en: 'LIGHTER',
    note: 'Tag on the lighter loadable option in the plate sheet. Upper case in English. Max 10 characters; fixed-width card.',
  },
  'plateSheet.heavierTag': {
    en: 'HEAVIER',
    note: 'Tag on the heavier loadable option in the plate sheet. Upper case in English. Max 10 characters; fixed-width card.',
  },
  'plateSheet.selected': {
    en: '{tag} · SELECTED',
    note: 'Tag of the chosen option in the plate sheet; {tag} is LIGHTER or HEAVIER. Upper case in English. Max 22 characters; fixed-width card.',
  },
  'plateSheet.barOnly': {
    en: 'bar only',
    note: 'Detail line in the plate sheet when no plates are needed; also its screen-reader label. Lower case in English. Max 10 characters.',
  },
  'plateSheet.eachSide': {
    en: 'EACH SIDE',
    note: 'Label before the per-side weight in the plate sheet. Upper case in English. Max 12 characters.',
  },
  'plateSheet.justBar': {
    en: 'Just the bar',
    note: 'Plate list line when no plates are needed.',
  },
  'plateSheet.use': {
    en: 'Use {weight} {unit}',
    note: 'Primary button in the plate sheet that fills the set with the loaded weight. Max 20 characters; fixed-width button.',
  },
  'setRow.name': {
    en: 'set {badge}',
    note: 'Screen-reader phrase naming a set inside longer labels; {badge} is 1, 2 or W, D, F. Lower case in English. Not visible.',
  },
  'setRow.weightField': {
    en: 'Weight in {unit}, {set}',
    note: 'Screen-reader label of the weight field in a set row; {unit} is kg or lb, {set} names the set. Not visible.',
  },
  'setRow.repsField': {
    en: 'Reps, {set}',
    note: 'Screen-reader label of the reps field in a set row; {set} names the set. Not visible.',
  },
  'setRow.markNotDone': {
    en: 'Mark {set} not done',
    note: 'Screen-reader label of the tick on a done set; {set} names the set. Not visible.',
  },
  'setRow.complete': {
    en: 'Complete {set}',
    note: 'Screen-reader label of the tick on a set not yet done; {set} names the set. Not visible.',
  },
  'setRow.deleteLabel': {
    en: 'Delete set {badge}',
    note: 'Screen-reader label of the swipe-revealed Delete button of a set row; {badge} is 1, 2 or W, D, F. Not visible.',
  },
  'setRow.typeLabel': {
    en: 'Set {badge}, {type}',
    note: 'Screen-reader label of the set-type badge; {badge} is the set number or letter, {type} a set type word. Not visible.',
  },
  'setRow.typeHint': {
    en: 'Tap to change set type.',
    note: 'Screen-reader hint of the set-type badge. Not visible.',
  },
  'setRow.wasLabel': {
    en: 'Set {badge}, {was}',
    note: 'Screen-reader label of the WAS cell in Edit Workout; {was} is the cell text. Not visible.',
  },
  'setRow.wasHint': {
    en: 'Switches this set between done and not done',
    note: 'Screen-reader hint of the WAS cell in Edit Workout. Not visible.',
  },
  'setRow.rateSet': {
    en: 'Rate this set',
    note: 'Screen-reader label of the effort add button in a set row. Not visible.',
  },
  'setRow.effort': {
    en: 'Effort {value}',
    note: 'Screen-reader label of the effort rating in a set row; {value} is like @8 or 2 RIR. Not visible.',
  },
  'setRow.effortHint': {
    en: 'Opens the effort scale',
    note: 'Screen-reader hint of the effort button in a set row. Not visible.',
  },
  'setRow.suggested': {
    en: 'Suggested {weight} {unit} by {reps}',
    note: 'Screen-reader label of the progression suggestion in a set row; {weight} {unit} by {reps} reps. Not visible.',
  },
  'setRow.suggestedHint': {
    en: 'Fills this set with the suggestion',
    note: 'Screen-reader hint of the progression suggestion in a set row. Not visible.',
  },
  'setRow.removeLabel': {
    en: 'Remove set {badge}',
    note: 'Screen-reader label of the remove button of a set row in Edit Workout. Not visible.',
  },
  'setType.normal': {
    en: 'normal',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible.',
  },
  'setType.warmup': {
    en: 'warm-up',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible.',
  },
  'setType.drop': {
    en: 'drop',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible.',
  },
  'setType.failure': {
    en: 'failure',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible.',
  },
  'exerciseCard.about': {
    en: 'About {name}',
    note: 'Screen-reader label of the exercise avatar on a workout card; opens exercise details. Not visible.',
  },
  'exerciseCard.more': {
    en: 'More options for {name}',
    note: 'Screen-reader label of the three-dot menu button on an exercise card. Not visible.',
  },
  'exerciseCard.notesLabel': {
    en: 'Notes for {name}',
    note: 'Screen-reader label of the notes field on an exercise card. Not visible.',
  },
  'exerciseCard.notesPlaceholder': {
    en: 'Add notes here…',
    note: 'Placeholder of the notes field on an exercise card. Keep the ellipsis.',
  },
  'exerciseCard.colSet': {
    en: 'SET',
    note: 'Column header over the set badges on an exercise card. Upper case in English. Max 5 characters; fixed-width column.',
  },
  'exerciseCard.colWas': {
    en: 'WAS',
    note: 'Column header over the previous-value cell on an exercise card in Edit Workout. Upper case in English. Max 5 characters; fixed-width column.',
  },
  'exerciseCard.colPrev': {
    en: 'PREV',
    note: 'Column header over the previous-session cell on an exercise card. Upper case in English. Max 5 characters; fixed-width column.',
  },
  'exerciseCard.colReps': {
    en: 'REPS',
    note: 'Column header over the reps field on an exercise card. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'exerciseCard.addSet': {
    en: '+ Add Set',
    note: 'Button under the set rows on an exercise card. Keep the plus sign. Max 12 characters; half-width button.',
  },
  'exerciseCard.warmupLabel': {
    en: 'Add warm-up sets',
    note: 'Screen-reader label of the Warm-up button on an exercise card. Not visible.',
  },
  'share.permTitle': {
    en: 'Permission needed',
    note: 'Alert title when saving the share image to Photos is not allowed.',
  },
  'share.permBody': {
    en: 'Ischys needs permission to save to Photos.',
    note: 'Alert message under Permission needed. Keep Ischys untranslated.',
  },
  'share.captureTitle': {
    en: 'Could not capture image',
    note: 'Alert title when the share card image could not be rendered.',
  },
  'share.tryAgain': {
    en: 'Please try again.',
    note: 'Alert message under Could not capture image.',
  },
  'share.savedTitle': {
    en: 'Saved to Photos',
    note: 'Alert title confirming the share image was saved.',
  },
  'share.saveFailedTitle': {
    en: 'Save failed',
    note: 'Alert title when saving the share image fails.',
  },
  'share.saveFailedBody': {
    en: 'Could not save to Photos.',
    note: 'Alert message under Save failed.',
  },
  'share.unavailableTitle': {
    en: 'Sharing unavailable',
    note: 'Alert title when the system share sheet is not available.',
  },
  'share.unavailableBody': {
    en: 'System sharing is not available on this device.',
    note: 'Alert message under Sharing unavailable.',
  },
  'share.dialogTitle': {
    en: 'Share workout',
    note: 'Title of the system share dialog (Android) and of the share bottom sheet. Max 20 characters.',
  },
  'share.layoutCompact': {
    en: 'Compact',
    note: 'Layout chip in the share sheet. Max 10 characters; fixed-width chip.',
  },
  'share.layoutStandard': {
    en: 'Standard',
    note: 'Layout chip in the share sheet. Max 10 characters; fixed-width chip.',
  },
  'share.layoutDetailed': {
    en: 'Detailed',
    note: 'Layout chip in the share sheet. Max 10 characters; fixed-width chip.',
  },
  'share.closeLabel': {
    en: 'Close share sheet',
    note: 'Screen-reader label of the close button of the share sheet. Not visible.',
  },
  'share.saveLabel': {
    en: 'Save workout image to Photos',
    note: 'Screen-reader label of the Save image button. Not visible.',
  },
  'share.saveImage': {
    en: 'Save image',
    note: 'Secondary button in the share sheet that saves the card to Photos. Max 12 characters; half-width button.',
  },
  'share.shareLabel': {
    en: 'Share workout image',
    note: 'Screen-reader label of the Share button. Not visible.',
  },
  'share.shareButton': {
    en: 'Share',
    note: 'Primary button in the share sheet that opens the system share dialog. Max 12 characters; half-width button.',
  },
  'share.nothing': {
    en: 'Nothing to share',
    note: 'Empty state title in the share sheet.',
  },
  'share.nothingSub': {
    en: 'This workout has no data yet.',
    note: 'Empty state subtitle in the share sheet.',
  },
  'share.cardVolume': {
    en: 'VOLUME',
    note: 'Stat label on the share card image (compact layout). Upper case in English. Max 8 characters.',
  },
  'share.cardDuration': {
    en: 'DURATION',
    note: 'Stat label on the share card image. Upper case in English. Max 9 characters; fixed-width column.',
  },
  'share.cardSets': {
    en: 'SETS',
    note: 'Stat label on the share card image. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'share.prChip_one': {
    en: '{count} PR',
    note: 'Chip on the share card image, singular. Max 10 characters.',
  },
  'share.prChip_other': {
    en: '{count} PRs',
    note: 'Chip on the share card image, plural. Max 12 characters.',
  },
  'common.setsCount': {
    en: '{count} sets',
    note: 'Number of sets: {count} is a number. Used under exercise names in the reorder overlay, in the summary exercise rows and the muscle split. Max 12 characters; fixed-width.',
  },
  'common.nothingChanged': {
    en: 'Nothing was changed. Try again.',
    note: 'Alert message after a failed save or finish; follows a title such as Couldn’t finish workout.',
  },
  'common.notNow': {
    en: 'Not now',
    note: 'Dismiss button on an alert or a suggestion card. Max 10 characters; fixed-width button.',
  },
  'common.undo': {
    en: 'Undo',
    note: 'Undo button or link on removed rows, receipts and suggestion cards. Max 8 characters; fixed-width.',
  },
  'common.close': {
    en: 'Close',
    note: 'Screen-reader label of an X close button. Not visible.',
  },
  'summary.bestSet': {
    en: 'Best set · {weight} × {reps}{rated}',
    note: 'Subtitle of an exercise row on the workout summary; {weight} includes the unit, {reps} a number, {rated} an optional effort rating with a leading space (like @8). Max 36 characters.',
  },
  'summary.saveRoutineFailed': {
    en: 'Couldn’t save routine',
    note: 'Alert title when saving a workout as a routine fails.',
  },
  'summary.updateRoutineFailed': {
    en: 'Couldn’t update routine',
    note: 'Alert title when updating a routine from a workout fails.',
  },
  'summary.header': {
    en: 'WORKOUT',
    note: 'Centered title in the workout summary header. Upper case in English. Max 10 characters.',
  },
  'summary.statDuration': {
    en: 'DURATION',
    note: 'Stat label on the workout summary. Upper case in English. Max 9 characters; fixed-width column.',
  },
  'summary.statVolume': {
    en: 'VOLUME',
    note: 'Stat label on the workout summary. Upper case in English. Max 9 characters; fixed-width column.',
  },
  'summary.statSets': {
    en: 'SETS',
    note: 'Stat label on the workout summary. Upper case in English. Max 9 characters; fixed-width column.',
  },
  'summary.prBanner_one': {
    en: '{count} New Personal Record',
    note: 'Banner title on the workout summary, singular. Max 28 characters.',
  },
  'summary.prBanner_other': {
    en: '{count} New Personal Records',
    note: 'Banner title on the workout summary, plural. Max 28 characters.',
  },
  'summary.exercises': {
    en: 'EXERCISES · {count}',
    note: 'Section label above the exercise list on the workout summary; {count} is a number. Upper case in English.',
  },
  'summary.volumeByMuscle': {
    en: 'VOLUME BY MUSCLE',
    note: 'Section label above the muscle split on the workout summary. Upper case in English.',
  },
  'summary.stalledTitle': {
    en: 'This lift has stalled',
    note: 'Title of the deload advice card on the workout summary.',
  },
  'summary.rampTitle': {
    en: 'Volume jumped fast',
    note: 'Title of the deload advice card on the workout summary when weekly volume rose sharply.',
  },
  'summary.stalledBody': {
    en: 'No new best in a while. A week at {percent}% often moves it further than pushing does.',
    note: 'Body of the deload advice card for a stalled lift; {percent} is a number like 90.',
  },
  'summary.rampBody': {
    en: 'This has climbed quickly. Holding for {days} days lets it catch up.',
    note: 'Body of the deload advice card for a fast volume rise; {days} is a number.',
  },
  'summary.easeOff': {
    en: 'Ease off for {days} days',
    note: 'Accept button of the deload advice card for a stalled lift; {days} is a number. Max 24 characters; fixed-width button.',
  },
  'summary.hold': {
    en: 'Hold for {days} days',
    note: 'Accept button of the deload advice card for a fast volume rise; {days} is a number. Max 24 characters; fixed-width button.',
  },
  'summary.deloadAccepted': {
    en: 'Suggestions will read {percent}% for {days} days. Nothing was written to your sets.',
    note: 'Receipt text after accepting deload advice; {percent} and {days} are numbers.',
  },
  'summary.routineChanged': {
    en: 'You changed this routine',
    note: 'Title of the routine update card on the workout summary.',
  },
  'summary.changeCount_one': {
    en: '{count} change',
    note: 'Count on the routine update card, singular.',
  },
  'summary.changeCount_other': {
    en: '{count} changes',
    note: 'Count on the routine update card, plural.',
  },
  'summary.moreChanges_one': {
    en: 'and {count} more change',
    note: 'Row on the routine update card that expands hidden changes, singular.',
  },
  'summary.moreChanges_other': {
    en: 'and {count} more changes',
    note: 'Row on the routine update card that expands hidden changes, plural.',
  },
  'summary.updateRoutine': {
    en: 'Update routine',
    note: 'Primary button on the routine update card. Max 18 characters; fixed-width button.',
  },
  'summary.keepAsIs': {
    en: 'Keep as-is',
    note: 'Secondary button on the routine update card. Max 18 characters; fixed-width button.',
  },
  'summary.saveAsNew': {
    en: 'Save as a new routine instead',
    note: 'Text link on the routine update card.',
  },
  'summary.routineUpdated': {
    en: 'Routine updated',
    note: 'Title of the receipt after updating a routine.',
  },
  'summary.savedAsNew': {
    en: 'Saved as new routine',
    note: 'Title of the receipt after saving a new routine.',
  },
  'summary.receiptUpdated': {
    en: '{name} · {changes} saved',
    note: 'Receipt subtitle after updating a routine; {name} is the routine name, {changes} the change count text (3 changes).',
  },
  'summary.receiptAdded': {
    en: '{name} · added to routines',
    note: 'Receipt subtitle after saving a new routine; {name} is the routine name.',
  },
  'summary.saveAsRoutine': {
    en: 'Save as Routine',
    note: 'Secondary button under Done on the workout summary. Max 20 characters; full-width button.',
  },
  'summary.editLabel': {
    en: 'Edit workout',
    note: 'Screen-reader label of the Edit button in the summary header. Not visible.',
  },
  'summary.edit': {
    en: 'Edit',
    note: 'Button in the summary header that opens Edit Workout. Max 6 characters; fixed-width pill.',
  },
  'summary.share': {
    en: 'Share',
    note: 'Button in the summary header that opens the share sheet. Max 8 characters; fixed-width pill.',
  },
  'routineDiff.sets_one': {
    en: '{count} set',
    note: 'Detail on a routine-update row for an added exercise, singular. Max 14 characters.',
  },
  'routineDiff.sets_other': {
    en: '{count} sets',
    note: 'Detail on a routine-update row for an added exercise, plural. Max 14 characters.',
  },
  'routineDiff.setsChanged': {
    en: '{from} → {to} sets',
    note: 'Detail on a routine-update row: the set count changed from {from} to {to}. Keep the arrow. Max 18 characters.',
  },
  'routineDiff.type.normal': {
    en: 'normal',
    note: 'Set type inside a routine-update row (set 3 normal → drop set). Lower case in English.',
  },
  'routineDiff.type.warmup': {
    en: 'warm-up',
    note: 'Set type inside a routine-update row. Lower case in English.',
  },
  'routineDiff.type.drop': {
    en: 'drop set',
    note: 'Set type inside a routine-update row. Lower case in English.',
  },
  'routineDiff.type.failure': {
    en: 'to failure',
    note: 'Set type inside a routine-update row. Lower case in English.',
  },
  'routineDiff.typeChange': {
    en: 'set {n} {from} → {to}',
    note: 'Detail on a routine-update row: set {n} changed type from {from} to {to}. Keep the arrow. Lower case in English.',
  },
  'routineDiff.typeSet': {
    en: 'set {n} {to}',
    note: 'Detail on a routine-update row: new set {n} of type {to}. Lower case in English.',
  },
  'routineDiff.setRemoved': {
    en: 'set {n} removed',
    note: 'Detail on a routine-update row: set {n} was removed. Lower case in English.',
  },
  'routineDiff.nowSuperset': {
    en: 'now a superset',
    note: 'Detail on a routine-update row. Lower case in English.',
  },
  'routineDiff.noSuperset': {
    en: 'no longer a superset',
    note: 'Detail on a routine-update row. Lower case in English.',
  },
  'routineDiff.rest': {
    en: 'rest {from} → {to}',
    note: 'Detail on a routine-update row: rest time changed from {from} to {to} (like 1:30 or 45s). Keep the arrow. Lower case in English.',
  },
  'routineDiff.moved': {
    en: 'moved',
    note: 'Detail on a routine-update row for a reordered exercise. Lower case in English.',
  },
  'routineDiff.removed': {
    en: 'removed',
    note: 'Detail on a routine-update row for a removed exercise. Lower case in English.',
  },
  'healthEdit.updates': {
    en: 'Saving updates this workout in {product} too.',
    note: 'Footnote in the Edit Workout date sheet; {product} is Apple Health or Health Connect.',
  },
  'healthEdit.watch': {
    en: '{product} keeps your Watch’s recording. Only Ischys changes.',
    note: 'Footnote in the Edit Workout date sheet when the Watch recorded the workout; {product} is Apple Health or Health Connect. Keep Ischys untranslated.',
  },
  'healthEdit.writeOff': {
    en: 'Writing to {product} is off, so it won’t change.',
    note: 'Footnote in the Edit Workout date sheet when writing to the health store is off; {product} is Apple Health or Health Connect.',
  },
  'editWorkout.saveFailed': {
    en: 'Couldn’t save',
    note: 'Alert title when saving an edited workout fails.',
  },
  'editWorkout.missingTitle': {
    en: 'Nothing to edit',
    note: 'Title of the card shown when the workout being edited no longer exists.',
  },
  'editWorkout.missingBody': {
    en: 'This workout isn’t in your history any more.',
    note: 'Body of the card shown when the workout being edited no longer exists. Keep the typographic apostrophe.',
  },
  'editWorkout.whenDate': {
    en: 'DATE',
    note: 'Label of the date cell at the top of Edit Workout. Upper case in English. Max 9 characters; one third of the screen width.',
  },
  'editWorkout.whenStart': {
    en: 'START',
    note: 'Label of the start time cell at the top of Edit Workout. Upper case in English. Max 9 characters; one third of the screen width.',
  },
  'editWorkout.whenDuration': {
    en: 'DURATION',
    note: 'Label of the duration cell at the top of Edit Workout. Upper case in English. Max 9 characters; one third of the screen width.',
  },
  'editWorkout.was': {
    en: 'was {value}',
    note: 'Grey line under a changed date, start or duration cell in Edit Workout; {value} is the saved value. Lower case in English. Max 18 characters; one third of the screen width.',
  },
  'editWorkout.noExercises': {
    en: 'No exercises',
    note: 'Title of the empty card in Edit Workout when every exercise was removed.',
  },
  'editWorkout.noSets': {
    en: 'No sets',
    note: 'Title of the empty card in Edit Workout when no set is left.',
  },
  'editWorkout.needSet': {
    en: 'A workout needs at least one set to save. To remove the whole workout, delete it from History.',
    note: 'Body of the empty card in Edit Workout explaining why Save is disabled.',
  },
  'editWorkout.addExercise': {
    en: 'Add Exercise',
    note: 'Button at the bottom of Edit Workout and of the active workout list that opens the exercise library. Max 20 characters.',
  },
  'editWorkout.editing': {
    en: 'EDITING',
    note: 'Small caption above the workout name in the Edit Workout header. Upper case in English. Max 10 characters.',
  },
  'editWorkout.cellLabel': {
    en: '{label}, {value}',
    note: 'Screen-reader label of a date/start/duration cell in Edit Workout; {label} is the lower-cased cell label, {value} its value. Not visible.',
  },
  'editWorkout.cellHint': {
    en: 'Opens the date and time picker',
    note: 'Screen-reader hint of a date/start/duration cell in Edit Workout. Not visible.',
  },
};
