import type { StringDef } from '../translate.ts';

/** English source strings. `note` is the context handed to the translator. */
export const strings: Record<string, StringDef> = {
  'workout.emptyName': {
    en: 'Empty Workout',
    note: 'Default title of a workout started empty, with no routine. Display only: the stored name stays English. Short noun, shown as a card or screen title.',
  },
  'profile.defaultName': {
    en: 'Athlete',
    note: 'Name shown for a profile whose owner has not set a name. Display only: the stored name stays English. One short word.',
  },
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
    plural: 'days',
  },
  'pr.pill': {
    en: '{count} PR',
    note: 'Green pill on a workout card counting personal records; {count} is a number. Keep PR untranslated or use the short term for personal record. Max 10 characters.',
    plural: 'count',
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
  'home.exerciseCount': {
    en: '{count} exercises',
    note: 'Subline under the routine name in the routine menu sheet on Home and in the Reorder Routines list; {count} is a number. One line.',
    plural: 'count',
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
    plural: 'count',
  },
  'history.heatLabel': {
    en: 'LAST 12 WEEKS',
    note: 'Small upper-case caption of the activity heat map card on History. Upper case in English. Max 16 characters.',
  },
  'history.sessions': {
    en: '{count} sessions',
    note: 'Right side of the heat map header on History; {count} is the number of workouts in the last 12 weeks. Max 16 characters.',
    plural: 'count',
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
    plural: 'count',
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
    plural: 'count',
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
    plural: 'to',
  },
  'effort.oneRep': {
    en: '1 REP LEFT',
    note: 'Effort meaning, exactly one rep left. Upper case in English. Max 16 characters.',
  },
  'effort.nReps': {
    en: '{n} REPS LEFT',
    note: 'Effort meaning, several reps left; {n} is 2, 3 or 4. Upper case in English. Max 16 characters.',
    plural: 'n',
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
    note: 'Set type word in the WAS cell of Edit Workout (was normal). Lower case in English. Max 9 characters; fixed-width cell. Glossary term: 组 (set type; fixed, do not vary).',
  },
  'workoutEdit.type.warmup': {
    en: 'warm-up',
    note: 'Set type word in the WAS cell of Edit Workout (was warm-up). Lower case in English. Max 9 characters; fixed-width cell. Glossary term: 热身组 (set type; fixed, do not vary).',
  },
  'workoutEdit.type.drop': {
    en: 'drop',
    note: 'Set type word in the WAS cell of Edit Workout (was drop). Lower case in English. Max 9 characters; fixed-width cell. Glossary term: 递减组 (set type; fixed, do not vary).',
  },
  'workoutEdit.type.failure': {
    en: 'failure',
    note: 'Set type word in the WAS cell of Edit Workout (was failure). Lower case in English. Max 9 characters; fixed-width cell. Glossary term: 力竭组 (set type; fixed, do not vary).',
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
    plural: 'count',
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
    plural: 'count',
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
  'routineReorder.title': {
    en: 'Reorder Routines',
    note: 'Title of the full-screen routine reorder list, opened from Reorder in a routine menu on Home. Same style as Reorder Exercises.',
  },
  'routineReorder.handleLabel': {
    en: 'Reorder {name}',
    note: 'Screen-reader label of a routine drag handle in the reorder list; {name} is the routine name. Not visible.',
  },
  'routineReorder.handleHint': {
    en: 'Drag up or down',
    note: 'Screen-reader hint of a routine drag handle in the reorder list. Not visible.',
  },
  'routineReorder.moveUp': {
    en: 'Move up',
    note: 'Screen-reader action: move the routine one place up in the list. Not visible.',
  },
  'routineReorder.moveDown': {
    en: 'Move down',
    note: 'Screen-reader action: move the routine one place down in the list. Not visible.',
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
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible. Glossary term: 组 (set type; fixed, do not vary).',
  },
  'setType.warmup': {
    en: 'warm-up',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible. Glossary term: 热身组 (set type; fixed, do not vary).',
  },
  'setType.drop': {
    en: 'drop',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible. Glossary term: 递减组 (set type; fixed, do not vary).',
  },
  'setType.failure': {
    en: 'failure',
    note: 'Set type word inside a screen-reader label. Lower case in English. Not visible. Glossary term: 力竭组 (set type; fixed, do not vary).',
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
    plural: 'count',
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
    plural: 'days',
  },
  'summary.easeOff': {
    en: 'Ease off for {days} days',
    note: 'Accept button of the deload advice card for a stalled lift; {days} is a number. Max 24 characters; fixed-width button.',
    plural: 'days',
  },
  'summary.hold': {
    en: 'Hold for {days} days',
    note: 'Accept button of the deload advice card for a fast volume rise; {days} is a number. Max 24 characters; fixed-width button.',
    plural: 'days',
  },
  'summary.deloadAccepted': {
    en: 'Suggestions will read {percent}% for {days} days. Nothing was written to your sets.',
    note: 'Receipt text after accepting deload advice; {percent} and {days} are numbers.',
    plural: 'days',
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
    plural: 'to',
  },
  'routineDiff.type.normal': {
    en: 'normal',
    note: 'Set type inside a routine-update row (set 3 normal → drop set). Lower case in English. Glossary term: 组 (set type; fixed, do not vary).',
  },
  'routineDiff.type.warmup': {
    en: 'warm-up',
    note: 'Set type inside a routine-update row. Lower case in English. Glossary term: 热身组 (set type; fixed, do not vary).',
  },
  'routineDiff.type.drop': {
    en: 'drop set',
    note: 'Set type inside a routine-update row. Lower case in English. Glossary term: 递减组 (set type; fixed, do not vary).',
  },
  'routineDiff.type.failure': {
    en: 'to failure',
    note: 'Set type inside a routine-update row. Lower case in English. Glossary term: 力竭组 (set type; fixed, do not vary).',
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
  'measurements.title': {
    en: 'Measurements',
    note: 'Title of the body measurements screen (list of waist, chest, etc.). Header title; one line.',
  },
  'measurements.notLogged': {
    en: 'Not logged',
    note: 'Row value on the measurements list when that body part has no reading yet. Max 12 characters; fixed-width row.',
  },
  'measurements.log': {
    en: 'Log',
    note: 'Primary button on the measurements screen that opens the logging sheet. Max 6 characters.',
  },
  'measurements.logTitle': {
    en: 'Log measurements',
    note: 'Title of the sheet where body measurements are entered.',
  },
  'measurements.logNote': {
    en: 'Fill in what you measured. Blanks are skipped.',
    note: 'Helper line under the sheet title. Blank fields are ignored when saving.',
  },
  'measurements.saveFailed': {
    en: 'Couldn’t save',
    note: 'Alert title when saving measurements fails; the message is common.nothingChanged.',
  },
  'measurements.empty': {
    en: 'Log this twice to see it over time.',
    note: 'Empty-state line on a single measurement chart screen when fewer than two readings exist.',
  },
  'measurements.sourceHealth': {
    en: 'HEALTH',
    note: 'Small tag on a measurement history row: the reading came from Apple Health. Upper case in English. Max 8 characters.',
  },
  'measurements.sourceManual': {
    en: 'MANUAL',
    note: 'Small tag on a measurement history row: the reading was typed in by the user. Upper case in English. Max 8 characters.',
  },
  'measurements.metric.waist': {
    en: 'Waist',
    note: 'Body measurement name: waist circumference. Row label.',
  },
  'measurements.metric.chest': {
    en: 'Chest',
    note: 'Body measurement name: chest circumference. Row label.',
  },
  'measurements.metric.arms': {
    en: 'Arms',
    note: 'Body measurement name: arm circumference. Row label.',
  },
  'measurements.metric.thighs': {
    en: 'Thighs',
    note: 'Body measurement name: thigh circumference. Row label.',
  },
  'measurements.metric.calves': {
    en: 'Calves',
    note: 'Body measurement name: calf circumference. Row label.',
  },
  'measurements.metric.shoulders': {
    en: 'Shoulders',
    note: 'Body measurement name: shoulder circumference. Row label.',
  },
  'measurements.metric.hips': {
    en: 'Hips',
    note: 'Body measurement name: hip circumference. Row label.',
  },
  'measurements.metric.neck': {
    en: 'Neck',
    note: 'Body measurement name: neck circumference. Row label.',
  },
  'measurements.metric.bodyweight': {
    en: 'Bodyweight',
    note: 'Body measurement name: body weight. Row label.',
  },
  'measurements.metric.bodyFat': {
    en: 'Body fat',
    note: 'Body measurement name: body fat percentage. Row label.',
  },
  'common.back': {
    en: 'Back',
    note: 'Screen-reader label of the back chevron button in screen headers. Not visible.',
  },
  'plates.title': {
    en: 'Bar & plates',
    note: 'Title of the bar and plates setup screen (also the Settings row label). One line.',
  },
  'plates.bar': {
    en: 'BAR',
    note: 'Section label above the barbell weight options on the bar and plates screen. Upper case in English.',
  },
  'plates.platesPairs': {
    en: 'PLATES · PAIRS',
    note: 'Section label above the list of plate sizes, each with how many pairs the gym has. Upper case in English.',
  },
  'plates.fewer': {
    en: 'One fewer pair of {plate} plates',
    note: 'Screen-reader label of the minus button for a plate size; {plate} is a weight with unit such as 20 kg. Not visible.',
  },
  'plates.more': {
    en: 'One more pair of {plate} plates',
    note: 'Screen-reader label of the plus button for a plate size; {plate} is a weight with unit such as 20 kg. Not visible.',
  },
  'plates.hint': {
    en: 'Set a plate to 0 if your gym doesn\'t have it.',
    note: 'Hint line under the plates list.',
  },
  'plates.reset': {
    en: 'Reset to a standard set',
    note: 'Text button that restores the default bar and plate set.',
  },
  'oneRm.title': {
    en: '1RM calculator',
    note: 'Title of the one-rep-max calculator screen. Keep 1RM untranslated.',
  },
  'oneRm.from': {
    en: 'From {name}',
    note: 'Line above the calculator inputs when opened from an exercise; {name} is the exercise name.',
  },
  'oneRm.weight': {
    en: 'WEIGHT',
    note: 'Input field caption for the lifted weight in the 1RM calculator. Upper case in English. Max 8 characters; two fields share a row.',
  },
  'oneRm.reps': {
    en: 'REPS',
    note: 'Input field caption for repetitions in the 1RM calculator. Upper case in English. Max 8 characters; two fields share a row.',
  },
  'oneRm.repsSuffix': {
    en: 'reps',
    note: 'Unit text inside the reps input field of the 1RM calculator. Max 4 characters.',
  },
  'oneRm.estimated': {
    en: 'ESTIMATED 1RM',
    note: 'Caption above the big estimated one-rep-max number. Upper case in English. Keep 1RM untranslated.',
  },
  'oneRm.close': {
    en: 'Close',
    note: 'Confidence tier name when the estimate comes from a low-rep set (reliable). One word, shown under the estimate.',
  },
  'oneRm.closeNote': {
    en: 'Low-rep sets give the most reliable estimate.',
    note: 'Explanation line under the Close tier.',
  },
  'oneRm.reasonable': {
    en: 'Reasonable',
    note: 'Confidence tier name for a medium-rep set. One word.',
  },
  'oneRm.reasonableNote': {
    en: 'Good enough to plan from. A set under 6 reps would sharpen it.',
    note: 'Explanation line under the Reasonable tier.',
  },
  'oneRm.rough': {
    en: 'Rough',
    note: 'Confidence tier name for a high-rep set (unreliable). One word.',
  },
  'oneRm.roughNote': {
    en: 'Past 10 reps this says more about your rep tolerance than your one-rep max. Log a set of 5 or fewer for a number worth planning from.',
    note: 'Explanation line under the Rough tier.',
  },
  'oneRm.enter': {
    en: 'Enter a weight and a rep count.',
    note: 'Prompt shown before a weight and reps have been entered.',
  },
  'oneRm.colLoad': {
    en: 'LOAD',
    note: 'Table column header: the weight to lift at each percentage. Upper case in English. Max 6 characters.',
  },
  'oneRm.colReps': {
    en: '≈ REPS',
    note: 'Table column header: approximate repetitions possible at each percentage. Upper case in English. Max 8 characters.',
  },
  'oneRm.footnote': {
    en: 'An estimate, never a personal record. {rounding}',
    note: 'Footnote under the percentage table; {rounding} is one of the two oneRm.roundPlates / oneRm.roundBar sentences.',
  },
  'oneRm.roundPlates': {
    en: 'Loads round to your plates.',
    note: 'Second sentence of the 1RM footnote when a barbell is used.',
  },
  'oneRm.roundBar': {
    en: 'Loads round to {step} {unit}.',
    note: 'Second sentence of the 1RM footnote when no barbell is used; {step} is a number, {unit} is kg or lb.',
  },
  'muscleMap.title': {
    en: 'Muscle map',
    note: 'Title of the muscle map screen (body diagram coloured by recent training).',
  },
  'muscleMap.days7': {
    en: '7 DAYS',
    note: 'Segmented control option: show the last 7 days. Upper case in English. Max 8 characters; fixed-width segment.',
  },
  'muscleMap.days28': {
    en: '28 DAYS',
    note: 'Segmented control option: show the last 28 days. Upper case in English. Max 8 characters; fixed-width segment.',
  },
  'muscleMap.scale28': {
    en: 'Sets per week, averaged over 28 days',
    note: 'Caption under the segmented control explaining the colour scale for the 28-day window.',
  },
  'muscleMap.scale7': {
    en: 'Sets in the last 7 days',
    note: 'Caption under the segmented control explaining the colour scale for the 7-day window.',
  },
  'muscleMap.front': {
    en: 'FRONT',
    note: 'Caption under the front view of the body diagram. Upper case in English.',
  },
  'muscleMap.back': {
    en: 'BACK',
    note: 'Caption under the back view of the body diagram. Upper case in English.',
  },
  'muscleMap.notTrained': {
    en: 'NOT TRAINED',
    note: 'Section label above the list of muscles with no recent work. Upper case in English.',
  },
  'muscleMap.setsPerWeek': {
    en: '{n} sets / week',
    note: 'Value in the muscle detail sheet for the 28-day window; {n} is a number.',
  },
  'muscleMap.sets': {
    en: '{n} sets',
    note: 'Value in the muscle detail sheet for the 7-day window; {n} is a number.',
  },
  'muscleMap.noneLogged': {
    en: 'Nothing logged for this muscle in the window.',
    note: 'Note in the muscle detail sheet when the muscle had no work and there is enough history.',
  },
  'muscleMap.notEnough': {
    en: 'Not enough history yet to call this neglected.',
    note: 'Note in the muscle detail sheet when the muscle had no work but history is short.',
  },
  'muscleMap.counts': {
    en: 'Counts direct work in full and indirect work at half. Currently {tint}.',
    note: 'Note in the muscle detail sheet; {tint} is one of the muscleMap.tint words.',
  },
  'muscleMap.tint.none': {
    en: 'none',
    note: 'Intensity word used in the sentence "Currently {tint}": no work.',
  },
  'muscleMap.tint.low': {
    en: 'low',
    note: 'Intensity word used in the sentence "Currently {tint}": low work.',
  },
  'muscleMap.tint.medium': {
    en: 'medium',
    note: 'Intensity word used in the sentence "Currently {tint}": medium work.',
  },
  'muscleMap.tint.high': {
    en: 'high',
    note: 'Intensity word used in the sentence "Currently {tint}": high work.',
  },
  'muscleRegion.frontDelts': {
    en: 'Front Delts',
    note: 'Muscle-map region name: front of the shoulder. Not a catalog muscle. Shown in lists and the detail sheet title.',
  },
  'muscleRegion.sideDelts': {
    en: 'Side Delts',
    note: 'Muscle-map region name: side of the shoulder. Not a catalog muscle.',
  },
  'muscleRegion.rearDelts': {
    en: 'Rear Delts',
    note: 'Muscle-map region name: back of the shoulder. Not a catalog muscle.',
  },
  'muscleRegion.obliques': {
    en: 'Obliques',
    note: 'Muscle-map region name: side abdominal muscles. Not a catalog muscle.',
  },
  'record.bodyweightAbbr': {
    en: 'BW',
    note: 'Abbreviation for bodyweight in a record value such as "BW × 11" (bodyweight times 11 reps). Max 3 characters.',
  },
  'record.new': {
    en: 'NEW',
    note: 'Badge text for a first-ever personal record. Upper case in English. Max 6 characters.',
  },
  'mergeDup.title': {
    en: 'Merge duplicates',
    note: 'Title of the merge-duplicates screen; also the Settings row label. One line.',
  },
  'mergeDup.sameName': {
    en: 'SAME NAME',
    note: 'Small tag on a duplicate group: the exercises share the same name. Upper case in English. Max 14 characters.',
  },
  'mergeDup.sameImport': {
    en: 'SAME IMPORT',
    note: 'Small tag on a duplicate group: the exercises came from the same import. Upper case in English. Max 14 characters.',
  },
  'mergeDup.similarName': {
    en: 'SIMILAR NAME',
    note: 'Small tag on a duplicate group: the exercise names are similar. Upper case in English. Max 14 characters.',
  },
  'mergeDup.noHistory': {
    en: 'no history yet',
    note: 'Lower-case fragment in an exercise meta line when the exercise has never been trained.',
  },
  'mergeDup.since': {
    en: 'since {date}',
    note: 'Lower-case fragment in an exercise meta line; {date} is a month and year such as Jul 2026.',
  },
  'mergeDup.keepMeta': {
    en: '{sets} sets · {workouts} workouts · {since}',
    note: 'Meta line under an exercise name in the Keep list; {since} is the since fragment or "no history yet".',
  },
  'mergeDup.memberMeta': {
    en: '{equipment} · {sets} sets',
    note: 'Meta line under an exercise name on a duplicate group card; {equipment} is an equipment name.',
    plural: 'sets',
  },
  'mergeDup.scanFailed': {
    en: 'Could not scan the library',
    note: 'Error line shown when scanning the exercise library for duplicates fails.',
  },
  'mergeDup.cantMerge': {
    en: 'Can’t merge right now',
    note: 'Alert title when a merge is blocked by a workout in progress; message is the active-session text.',
  },
  'mergeDup.mergeFailed': {
    en: 'Merge failed',
    note: 'Alert title when merging exercises fails.',
  },
  'mergeDup.somethingWrong': {
    en: 'Something went wrong.',
    note: 'Alert message fallback when merging fails with no detail.',
  },
  'mergeDup.renameFailed': {
    en: 'Rename failed',
    note: 'Alert title when renaming an exercise fails.',
  },
  'mergeDup.renameFailedBody': {
    en: 'Could not rename the exercise.',
    note: 'Alert message when renaming an exercise fails.',
  },
  'mergeDup.keep': {
    en: 'KEEP',
    note: 'Section label above the list of exercises to choose which one to keep. Upper case in English.',
  },
  'mergeDup.whatCombines': {
    en: 'WHAT COMBINES',
    note: 'Section label above the summary of what merging combines. Upper case in English.',
  },
  'mergeDup.combined': {
    en: '{sets} sets across {workouts} workouts',
    note: 'Row in the what-combines card; both are numbers.',
  },
  'mergeDup.repoint_one': {
    en: '{count} routine re-points automatically',
    note: 'Row in the what-combines card: one routine will switch to the kept exercise. {count} is 1.',
  },
  'mergeDup.repoint_other': {
    en: '{count} routines re-point automatically',
    note: 'Row in the what-combines card: several routines will switch to the kept exercise. {count} is a number.',
  },
  'mergeDup.prHeader': {
    en: 'PERSONAL RECORDS · BEST OF EACH KEPT',
    note: 'Heading above the table of personal records after merge. Upper case in English.',
  },
  'mergeDup.fromDup': {
    en: 'from dup',
    note: 'Tag on a record row: the value comes from the duplicate exercise. Lower case in English. Max 10 characters.',
  },
  'mergeDup.kept': {
    en: 'kept',
    note: 'Tag on a record row: the value stays from the kept exercise. Lower case in English. Max 10 characters.',
  },
  'mergeDup.finePrint': {
    en: 'Nothing is deleted except the duplicate’s empty entry. Merging can’t be undone.',
    note: 'Fine print at the bottom of the merge detail screen.',
  },
  'mergeDup.mergeCount': {
    en: 'Merge {count} exercises',
    note: 'Header title of the merge detail screen; {count} is a number of exercises (2 or more).',
    plural: 'count',
  },
  'mergeDup.mergeInto': {
    en: 'Merge into {name}',
    note: 'Primary button on the merge detail screen; {name} is the kept exercise name. One line, truncated if long.',
  },
  'mergeDup.confirmTitle': {
    en: 'Merge these exercises?',
    note: 'Title of the confirmation sheet before merging.',
  },
  'mergeDup.confirm_one': {
    en: '{sets} sets and {count} routine will point to {name}. Your history and personal records are kept — only the duplicate’s empty entry is removed.',
    note: 'Body of the confirmation sheet; {sets} is a number of sets, {count} is 1 routine, {name} is the kept exercise name (shown in bold).',
  },
  'mergeDup.confirm_other': {
    en: '{sets} sets and {count} routines will point to {name}. Your history and personal records are kept — only the duplicate’s empty entry is removed.',
    note: 'Body of the confirmation sheet; {sets} is a number of sets, {count} is the number of routines, {name} is the kept exercise name (shown in bold).',
  },
  'mergeDup.cantUndo': {
    en: 'This can’t be undone.',
    note: 'Warning line in the confirmation sheet.',
  },
  'mergeDup.merge': {
    en: 'Merge',
    note: 'Confirm button in the merge confirmation sheet. Max 8 characters; fixed-width button.',
  },
  'mergeDup.intro': {
    en: 'These look like the same lift saved twice. Merging keeps every set and PR.',
    note: 'Intro line above the list of duplicate groups. PR means personal record.',
  },
  'mergeDup.remaining': {
    en: '{n} REMAINING',
    note: 'Section label after a merge: how many duplicate groups are left. Upper case in English.',
    plural: 'n',
  },
  'mergeDup.merged': {
    en: 'Merged',
    note: 'Title on the merge success receipt.',
  },
  'mergeDup.receiptSub': {
    en: '{name} · {sets} sets',
    note: 'Subtitle on the merge receipt; {name} is the kept exercise name, {sets} the total sets.',
    plural: 'sets',
  },
  'mergeDup.setsMoved': {
    en: 'Sets moved',
    note: 'Receipt row label: number of sets moved to the kept exercise.',
  },
  'mergeDup.routinesUpdated': {
    en: 'Routines updated',
    note: 'Receipt row label: number of routines switched to the kept exercise.',
  },
  'mergeDup.newPr': {
    en: 'New PR gained',
    note: 'Receipt row label: a new personal record resulted from the merge.',
  },
  'mergeDup.prLine': {
    en: '{metric} · {value}',
    note: 'Receipt row value: a record category and its value, e.g. Best set · 100 kg × 5.',
  },
  'mergeDup.rename': {
    en: 'Rename exercise',
    note: 'Button on the merge receipt that renames the kept exercise, and title of the rename text prompt.',
  },
  'mergeDup.emptyTitle': {
    en: 'No duplicates found',
    note: 'Empty-state title when no duplicate exercises exist.',
  },
  'mergeDup.emptyBody': {
    en: 'Your library is clean. {scope}',
    note: 'Empty-state body; {scope} is one of the two scope sentences.',
  },
  'mergeDup.scopeAll': {
    en: 'Ischys compares names, equipment and import source across all {total} exercises.',
    note: 'Scope sentence in the empty state; {total} is a number of exercises. Keep Ischys untranslated.',
    plural: 'total',
  },
  'mergeDup.scopeWhole': {
    en: 'Ischys compares names, equipment and import source across your whole library.',
    note: 'Scope sentence in the empty state when the exercise count is unknown. Keep Ischys untranslated.',
  },
  'mergeDup.spotOne': {
    en: 'IF YOU SPOT ONE ANYWAY',
    note: 'Label of the tip card in the empty state. Upper case in English.',
  },
  'mergeDup.spotOneBody': {
    en: 'Select both in the exercise library and choose Merge.',
    note: 'Tip text in the empty state explaining how to merge two exercises by hand.',
  },
  'mergeDup.reasonCatalog': {
    en: 'Keeps images, how-to and muscle data',
    note: 'One-line reason shown under the Keep list when the preselected exercise is a built-in one.',
  },
  'mergeDup.reasonHistory': {
    en: 'More history — fewer records move',
    note: 'One-line reason shown under the Keep list when the preselected exercise has more history.',
  },
  'mergeDup.activeSession': {
    en: 'A workout is in progress that uses one of these exercises. Finish it first.',
    note: 'Error message when a merge or delete is blocked because a workout in progress uses the exercise.',
  },
  'mergeDup.metric.1rm': {
    en: '1RM',
    note: 'Record label in the merge tables for estimated one-rep max. Keep 1RM untranslated.',
  },
  'mergeDup.metric.bestSet': {
    en: 'Best set',
    note: 'Record label in the merge tables: heaviest single set. Sentence case in English.',
  },
  'mergeDup.metric.maxReps': {
    en: 'Most reps',
    note: 'Record label in the merge tables: most repetitions in one set.',
  },
  'mergeDup.metric.bestVolume': {
    en: 'Best volume',
    note: 'Record label in the merge tables: most total weight lifted in one exercise.',
  },
  'profiles.inWorkout': {
    en: 'IN WORKOUT · {clock}',
    note: 'Profile switcher row sub line while that profile has a workout running; {clock} is elapsed time such as 12:34. Upper case in English.',
  },
  'profiles.noWorkoutsYet': {
    en: 'NO WORKOUTS YET',
    note: 'Profile row sub line for a profile with no completed workouts. Upper case in English.',
  },
  'profiles.lastToday': {
    en: 'LAST · TODAY',
    note: 'Profile switcher row sub line: last workout was today. Upper case in English.',
  },
  'profiles.lastDay': {
    en: 'LAST · {date}',
    note: 'Profile switcher row sub line: last workout date; {date} is a short date such as TUE 30 SEP. Upper case in English.',
  },
  'profiles.ownerHealthWatch': {
    en: 'OWNER · HEALTH · WATCH',
    note: 'Sub line of the owner profile in Manage profiles: this profile owns Health and Watch. Upper case in English.',
  },
  'profiles.manageCount_one': {
    en: '{count} WORKOUT · SINCE {date}',
    note: 'Sub line of a profile in Manage profiles: one workout; {date} is a month and year such as JUL 2026. Upper case in English.',
  },
  'profiles.manageCount_other': {
    en: '{count} WORKOUTS · SINCE {date}',
    note: 'Sub line of a profile in Manage profiles: several workouts; {date} is a month and year such as JUL 2026. Upper case in English.',
  },
  'profiles.phoneOwner': {
    en: 'the phone\'s owner',
    note: 'How copy refers to the profile that owns the phone when it still has the default name. Lower case, used mid-sentence.',
  },
  'profiles.thisProfile': {
    en: 'this profile',
    note: 'Fallback mid-sentence name for a profile with no name. Lower case.',
  },
  'profiles.copySub_one': {
    en: '{count} ROUTINE · COPIES, NOT LINKED',
    note: 'Sub line of the copy-routines toggle for one routine. Upper case in English.',
  },
  'profiles.copySub_other': {
    en: '{count} ROUTINES · COPIES, NOT LINKED',
    note: 'Sub line of the copy-routines toggle for several routines. Upper case in English.',
  },
  'profiles.copyYour': {
    en: 'Copy your routines',
    note: 'Label of the toggle on New profile when the current profile is the default-named owner.',
  },
  'profiles.copyTheirs': {
    en: 'Copy {name}\'s routines',
    note: 'Label of the toggle on New profile; {name} is the current profile first name.',
  },
  'profiles.footerWhose': {
    en: '{name}\'s workouts',
    note: 'Start of the Health and Watch footer on New profile; {name} is the new profile first name.',
  },
  'profiles.footerThis': {
    en: 'This profile\'s workouts',
    note: 'Start of the Health and Watch footer on New profile when no name is typed yet.',
  },
  'profiles.footer': {
    en: '{whose} stay in Ischys. {health} and the Watch belong to {owner}.',
    note: 'Footer under the Health and Watch rows on New profile; {whose} is the previous phrase, {health} is Apple Health or Health Connect, {owner} is a person name or the phone owner phrase.',
  },
  'profiles.possessive': {
    en: '{name}\'s',
    note: 'First name in possessive form, used mid-sentence in the delete sheet.',
  },
  'profiles.possessiveThis': {
    en: 'this profile\'s',
    note: 'Possessive used mid-sentence in the delete sheet when the profile has no name.',
  },
  'profiles.deleteLead': {
    en: 'This erases {whose} ',
    note: 'Start of the delete-profile sheet body; {whose} is a possessive name. Keep the trailing space. A count and a unit word follow.',
  },
  'profiles.deleteWorkouts_one': {
    en: ' workout, ',
    note: 'Delete sheet body: unit word after a count of 1 workout. Keep the surrounding spaces and the comma.',
  },
  'profiles.deleteWorkouts_other': {
    en: ' workouts, ',
    note: 'Delete sheet body: unit word after a count of workouts. Keep the surrounding spaces and the comma.',
  },
  'profiles.deleteRoutines_one': {
    en: ' routine, ',
    note: 'Delete sheet body: unit word after a count of 1 routine. Keep the surrounding spaces and the comma.',
  },
  'profiles.deleteRoutines_other': {
    en: ' routines, ',
    note: 'Delete sheet body: unit word after a count of routines. Keep the surrounding spaces and the comma.',
  },
  'profiles.deleteRecords_one': {
    en: ' record and every measurement from this phone. Other profiles aren\'t affected. This can\'t be undone.',
    note: 'Delete sheet body ending after a count of 1 personal record. Keep the leading space.',
  },
  'profiles.deleteRecords_other': {
    en: ' records and every measurement from this phone. Other profiles aren\'t affected. This can\'t be undone.',
    note: 'Delete sheet body ending after a count of personal records. Keep the leading space.',
  },
  'profiles.yourWorkout': {
    en: 'Your workout',
    note: 'Fallback workout name in the finish-first sheet when the running workout has no name.',
  },
  'profiles.finishYours': {
    en: 'Finish your workout first',
    note: 'Title of the sheet that blocks switching profile while the default-named owner has a workout running.',
  },
  'profiles.finishTheirs': {
    en: 'Finish {name}\'s workout first',
    note: 'Title of the sheet that blocks switching profile while a workout runs; {name} is that profile first name or the phone owner phrase.',
  },
  'profiles.finishLead': {
    en: '{routine} has been running for ',
    note: 'Start of the finish-first sheet body; {routine} is the workout name. A running clock follows. Keep the trailing space.',
  },
  'profiles.finishTail': {
    en: '. Only one workout can run at a time. Finish or discard it, then switch to {target}.',
    note: 'End of the finish-first sheet body after the clock; {target} is a profile first name or the phone owner phrase.',
  },
  'export.title': {
    en: 'Export data',
    note: 'Title of the export format alert, and the Settings row label for exporting data.',
  },
  'export.chooseFormat': {
    en: 'Choose a format',
    note: 'Message of the export format alert; its buttons are JSON, CSV and Cancel.',
  },
  'export.sharingUnavailable': {
    en: 'Sharing unavailable',
    note: 'Alert title when the system share sheet is not available to export a file.',
  },
  'export.failed': {
    en: 'Export failed',
    note: 'Alert title when exporting data fails.',
  },
  'profiles.title': {
    en: 'Profiles',
    note: 'Title of the Manage profiles screen.',
  },
  'profiles.reorderLabel': {
    en: 'Reorder {name}',
    note: 'Screen-reader label of a profile drag handle; {name} is the profile name. Not visible.',
  },
  'profiles.reorderHint': {
    en: 'Drag up or down',
    note: 'Screen-reader hint of a profile drag handle. Not visible.',
  },
  'profiles.moveUp': {
    en: 'Move up',
    note: 'Screen-reader action: move the profile one place up. Not visible.',
  },
  'profiles.moveDown': {
    en: 'Move down',
    note: 'Screen-reader action: move the profile one place down. Not visible.',
  },
  'profiles.rowLabel': {
    en: '{name}, {sub}',
    note: 'Screen-reader label of a profile row; {name} is the profile name, {sub} its lower-cased sub line. Not visible.',
  },
  'profiles.add': {
    en: 'Add profile',
    note: 'Add-profile row label, submit button label and screen-reader label on Manage profiles and New profile. Max 14 characters on the button.',
  },
  'profiles.reorderFooter': {
    en: 'Drag to reorder. The switcher shows profiles in this order.',
    note: 'Footer under the profile list on Manage profiles.',
  },
  'profiles.new': {
    en: 'New profile',
    note: 'Title of the New profile screen.',
  },
  'profiles.name': {
    en: 'NAME',
    note: 'Caption above the name field on profile screens. Upper case in English.',
  },
  'profiles.namePlaceholder': {
    en: 'Name',
    note: 'Placeholder and screen-reader label of the profile name input.',
  },
  'profiles.initials': {
    en: 'INITIALS',
    note: 'Caption above the initials field on profile screens. Upper case in English. Max 10 characters; the field is narrow.',
  },
  'profiles.initialsLabel': {
    en: 'Initials',
    note: 'Screen-reader label of the profile initials input. Not visible.',
  },
  'profiles.duplicate': {
    en: 'You already have a {name}. Change the initials to tell them apart.',
    note: 'Hint under the name field when another profile has the same name; {name} is that name.',
  },
  'profiles.healthWatch': {
    en: 'HEALTH & WATCH',
    note: 'Section label above the Health and Watch rows. Upper case in English.',
  },
  'profiles.rowOff': {
    en: '{name}, off',
    note: 'Screen-reader label of a Health or Watch row that is off for a new profile; {name} is Apple Health, Health Connect or Apple Watch. Not visible.',
  },
  'profiles.startWith': {
    en: 'START WITH',
    note: 'Section label above the copy-routines toggle on New profile. Upper case in English.',
  },
  'profiles.addFailed': {
    en: 'Couldn\'t add the profile. Try again.',
    note: 'Error line above the Add profile button when creating a profile fails.',
  },
  'profiles.exportThis': {
    en: 'Export this profile',
    note: 'Row label and screen-reader label on Edit profile for exporting this profile’s data.',
  },
  'profiles.exportFormats': {
    en: 'CSV · JSON',
    note: 'Row value showing the export formats. Keep CSV and JSON untranslated.',
  },
  'profiles.deleteRow': {
    en: 'Delete profile',
    note: 'Destructive row label and screen-reader label on Edit profile.',
  },
  'profiles.ownerNote': {
    en: 'This is the phone owner\'s profile. It can\'t be deleted.',
    note: 'Note on Edit profile for the owner profile, which cannot be deleted.',
  },
  'profiles.workoutNote': {
    en: 'Finish the workout in progress to delete this profile.',
    note: 'Note on Edit profile when a workout is running under that profile.',
  },
  'deleteProfile.sharingUnavailable': {
    en: 'Sharing unavailable.',
    note: 'Inline message in the delete-profile sheet when the system share sheet is unavailable for the export.',
  },
  'deleteProfile.exportFailed': {
    en: 'Couldn\'t export. Try again.',
    note: 'Inline message in the delete-profile sheet when the export fails.',
  },
  'deleteProfile.deleteFailed': {
    en: 'Couldn\'t delete {name}. Try again.',
    note: 'Inline message in the delete-profile sheet when deleting fails; {name} is the profile first name.',
  },
  'deleteProfile.alertTitle': {
    en: 'Couldn\'t delete {name}',
    note: 'Alert title when deleting a profile fails after the sheet has closed; {name} is the profile first name.',
  },
  'deleteProfile.alertBody': {
    en: 'Some of {whose} data may still be on this phone. Open Manage profiles and delete again.',
    note: 'Alert message when deleting a profile fails after the sheet has closed; {whose} is a possessive name.',
  },
  'deleteProfile.title': {
    en: 'Delete {name}?',
    note: 'Title of the delete-profile confirmation sheet; {name} is the full profile name.',
  },
  'deleteProfile.bodyPlain': {
    en: 'This erases {whose} data from this phone. Other profiles aren\'t affected. This can\'t be undone.',
    note: 'Body of the delete-profile sheet while the counts are still loading; {whose} is a possessive name.',
  },
  'deleteProfile.exportLabel': {
    en: 'Export {whose} data first',
    note: 'Screen-reader label of the export button in the delete-profile sheet; {whose} is a possessive name. Not visible.',
  },
  'deleteProfile.exportButton': {
    en: 'Export {name}\'s data first',
    note: 'Button in the delete-profile sheet that exports first; {name} is the profile first name. One line, wide button.',
  },
  'deleteProfile.deleteButton': {
    en: 'Delete {name}',
    note: 'Destructive button in the delete-profile sheet and its screen-reader label; {name} is the profile first name. One line.',
  },
  'finishFirst.go': {
    en: 'Go to workout',
    note: 'Button on the finish-first sheet that opens the running workout, and its screen-reader label. One line.',
  },
  'switcher.announce': {
    en: 'Switched to {name}',
    note: 'Screen-reader announcement after switching profile; {name} is the profile name. Not visible.',
  },
  'switcher.title': {
    en: 'Switch profile',
    note: 'Title of the profile switcher sheet.',
  },
  'switcher.manage': {
    en: 'Manage',
    note: 'Small button in the profile switcher header that opens Manage profiles. Max 8 characters.',
  },
  'switcher.manageLabel': {
    en: 'Manage profiles',
    note: 'Screen-reader label of the Manage button in the profile switcher. Not visible.',
  },
  'switcher.searchPlaceholder': {
    en: 'Search {n} profiles',
    note: 'Placeholder of the profile search field; {n} is the number of profiles.',
    plural: 'n',
  },
  'switcher.searchLabel': {
    en: 'Search profiles',
    note: 'Screen-reader label of the profile search field. Not visible.',
  },
  'switcher.rowLabel': {
    en: '{name}, {sub}',
    note: 'Screen-reader label of a profile row; {name} is the profile name, {sub} its sub line. Not visible.',
  },
  'rest.seconds': {
    en: '{n}s',
    note: 'Rest duration in seconds in the rest picker and rest rows, e.g. 30s. {n} is a number; keep it short. Max 5 characters.',
  },
  'routineEdit.new': {
    en: 'New Routine',
    note: 'Header title of the routine editor when creating a routine. One line.',
  },
  'routineEdit.edit': {
    en: 'Edit Routine',
    note: 'Header title of the routine editor when editing a routine with no name. One line.',
  },
  'routineEdit.namePlaceholder': {
    en: 'Routine name',
    note: 'Placeholder of the routine name input in the routine editor.',
  },
  'routineEdit.nameError': {
    en: 'Give your routine a name to save it.',
    note: 'Error line under the routine name input when saving without a name.',
  },
  'routineEdit.exercisesCount': {
    en: '{n} exercises',
    note: 'Meta line under the routine name: number of exercises; followed by a separator and the sets count.',
    plural: 'n',
  },
  'routineEdit.emptyTitle': {
    en: 'Build your routine',
    note: 'Empty-state title in the routine editor.',
  },
  'routineEdit.emptySub': {
    en: 'Add exercises and set target reps and weights. Pull them up instantly every session.',
    note: 'Empty-state body in the routine editor.',
  },
  'routineEdit.replaceLabel': {
    en: 'Replace {name}',
    note: 'Screen-reader label of the replace button on an exercise card; {name} is the exercise name. Not visible.',
  },
  'routineEdit.removeLabel': {
    en: 'Remove {name}',
    note: 'Screen-reader label of the remove button on an exercise card; {name} is the exercise name. Not visible.',
  },
  'routineEdit.restTimer': {
    en: 'Rest Timer',
    note: 'Row label on an exercise card in the routine editor, before the rest duration.',
  },
  'routineEdit.superset': {
    en: 'Superset',
    note: 'Row label on an exercise card in the routine editor, before the superset state.',
  },
  'routineEdit.leaveLabel': {
    en: 'Leave superset {tag}',
    note: 'Screen-reader label of the superset row when the exercise is in a superset; {tag} is a letter and number such as A1. Not visible.',
  },
  'routineEdit.ssWith': {
    en: '{tag} · with {names}',
    note: 'Superset row value; {tag} is a letter and number such as A1, {names} is a comma-separated list of partner exercise names.',
  },
  'routineEdit.leave': {
    en: 'Leave',
    note: 'Small action text on the superset row that removes the exercise from its superset. Max 8 characters.',
  },
  'routineEdit.none': {
    en: 'None',
    note: 'Superset row value when the exercise is not in a superset.',
  },
  'routineEdit.colType': {
    en: 'TYPE',
    note: 'Column header of the set-type column in the routine editor. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'routineEdit.type.normal': {
    en: 'Working',
    note: 'Set type shown in the TYPE column: a normal working set. Max 10 characters; fixed-width column. Glossary term: 组 (set type; fixed, do not vary).',
  },
  'routineEdit.type.warmup': {
    en: 'Warmup',
    note: 'Set type shown in the TYPE column: a warm-up set. Max 10 characters; fixed-width column. Glossary term: 热身组 (set type; fixed, do not vary).',
  },
  'routineEdit.type.drop': {
    en: 'Drop set',
    note: 'Set type shown in the TYPE column: a drop set. Max 10 characters; fixed-width column. Glossary term: 递减组 (set type; fixed, do not vary).',
  },
  'routineEdit.type.failure': {
    en: 'To failure',
    note: 'Set type shown in the TYPE column: a set taken to failure. Max 10 characters; fixed-width column. Glossary term: 力竭组 (set type; fixed, do not vary).',
  },
  'routineView.exercises_one': {
    en: '{count} EXERCISE',
    note: 'Routine meta line: exercise count for one exercise. Upper case in English.',
  },
  'routineView.exercises_other': {
    en: '{count} EXERCISES',
    note: 'Routine meta line: exercise count. Upper case in English.',
  },
  'routineView.sets_one': {
    en: '{count} SET',
    note: 'Routine meta line: set count for one set. Upper case in English.',
  },
  'routineView.sets_other': {
    en: '{count} SETS',
    note: 'Routine meta line: set count. Upper case in English.',
  },
  'routineView.then': {
    en: 'then {tag}',
    note: 'Exercise meta in a superset: this exercise rests after the next partner; {tag} is a letter and number such as A2. Lower case in English.',
  },
  'routineView.restAfterRound': {
    en: 'Rest after round {clock}',
    note: 'Exercise meta in a superset: the rest taken after each round; {clock} is a duration such as 1:30.',
  },
  'routineView.restOff': {
    en: 'Rest off',
    note: 'Exercise meta: the rest timer is off for this exercise.',
  },
  'routineView.rest': {
    en: 'Rest {clock}',
    note: 'Exercise meta: rest duration; {clock} is a duration such as 2:30.',
  },
  'routineView.notDone': {
    en: 'NOT DONE YET',
    note: 'Line under the routine title when the routine has never been performed. Upper case in English.',
  },
  'routineView.lastWithDuration': {
    en: 'LAST · {day} · {duration}',
    note: 'Line under the routine title: last performed date and workout length; {day} is a short date, {duration} is H:MM. Upper case in English.',
  },
  'routineView.last': {
    en: 'LAST · {day}',
    note: 'Line under the routine title: last performed date; {day} is a short date. Upper case in English.',
  },
  'routineView.noExercises': {
    en: 'No exercises yet',
    note: 'Empty-state title in the routine view when the routine has no exercises.',
  },
  'routineView.noExercisesSub': {
    en: 'Add some before this routine can be started.',
    note: 'Empty-state body in the routine view.',
  },
  'routineView.header': {
    en: 'ROUTINE',
    note: 'Small caption in the routine view header. Upper case in English.',
  },
  'routineView.editLabel': {
    en: 'Edit routine',
    note: 'Screen-reader label of the Edit button in the routine view. Not visible.',
  },
  'routineView.edit': {
    en: 'Edit',
    note: 'Edit button in the routine view header. Max 6 characters; fixed-width button.',
  },
  'routineView.addExercises': {
    en: 'Add exercises',
    note: 'Footer button of an empty routine view, opens the routine editor. One line.',
  },
  'routineView.start': {
    en: 'Start Routine',
    note: 'Footer button of the routine view that starts a workout from this routine. One line.',
  },
  'routineView.colTarget': {
    en: 'TARGET {unit}',
    note: 'Table column header for target weight and reps; {unit} is KG or LB. Upper case in English. Max 12 characters; fixed-width column.',
  },
  'routineView.colLast': {
    en: 'LAST',
    note: 'Table column header for the previous performance of each set. Upper case in English. Max 6 characters; fixed-width column.',
  },
  'newExercise.title': {
    en: 'New Exercise',
    note: 'Header title of the custom exercise form. One line.',
  },
  'newExercise.name': {
    en: 'NAME',
    note: 'Caption above the exercise name input. Upper case in English.',
  },
  'newExercise.namePlaceholder': {
    en: 'e.g. Incline Bench Press',
    note: 'Placeholder example in the exercise name input. Use a familiar exercise name.',
  },
  'newExercise.category': {
    en: 'CATEGORY',
    note: 'Caption above the category chips. Upper case in English.',
  },
  'newExercise.primary': {
    en: 'Primary muscle',
    note: 'Row label of the primary muscle picker in the custom exercise form.',
  },
  'newExercise.secondary': {
    en: 'Secondary muscles',
    note: 'Row label of the secondary muscles picker in the custom exercise form.',
  },
  'newExercise.none': {
    en: 'None',
    note: 'Row value when no muscle is selected in the custom exercise form.',
  },
  'newExercise.selected': {
    en: '{n} selected',
    note: 'Row value: number of secondary muscles selected.',
    plural: 'n',
  },
  'newExercise.equipment': {
    en: 'EQUIPMENT',
    note: 'Caption above the equipment chips. Upper case in English.',
  },
  'newExercise.kind': {
    en: 'KIND',
    note: 'Caption above the exercise kind selector (weighted or bodyweight). Upper case in English.',
  },
  'newExercise.kindWeighted': {
    en: 'Weighted',
    note: 'Exercise kind option: tracked with an added weight. Max 12 characters; segmented control.',
  },
  'newExercise.kindBodyweight': {
    en: 'Bodyweight',
    note: 'Exercise kind option: tracked with body weight. Max 12 characters; segmented control.',
  },
  'newExercise.howTo': {
    en: 'HOW TO',
    note: 'Caption above the optional how-to steps input. Upper case in English.',
  },
  'newExercise.howToPlaceholder': {
    en: 'One instruction per line',
    note: 'Placeholder of the how-to steps input.',
  },
  'newExercise.failed': {
    en: 'Failed to create exercise',
    note: 'Error line and alert message when creating a custom exercise fails with no detail.',
  },
  'newExercise.couldNotSave': {
    en: 'Could not save',
    note: 'Alert title when creating a custom exercise fails.',
  },
  'library.all': {
    en: 'All',
    note: 'First filter chip in the exercise library: show every category. Max 6 characters; chip.',
  },
  'library.yourLifts': {
    en: 'YOUR LIFTS',
    note: 'Section header above the exercises you train most in the library. Upper case in English.',
  },
  'library.new': {
    en: 'New',
    note: 'Header button in the exercise library that opens the custom exercise form. Max 6 characters.',
  },
  'library.search': {
    en: 'Search exercises',
    note: 'Placeholder and screen-reader label of the exercise library search field.',
  },
  'library.noMatch': {
    en: 'No exercises match "{query}"',
    note: 'Empty-state line when a search finds nothing; {query} is what the user typed.',
  },
  'library.noneFound': {
    en: 'No exercises found',
    note: 'Empty-state line in the exercise library when there are no exercises.',
  },
  'library.loadFailed': {
    en: 'Failed to load exercises',
    note: 'Error line when loading the exercise list fails with no detail.',
  },
  'library.addFailed': {
    en: 'Failed to add exercises',
    note: 'Error line when adding the picked exercises to the workout fails with no detail.',
  },
  'library.merge': {
    en: 'Merge {n}',
    note: 'Floating button when two or more exercises are selected: merge the {n} selected exercises. One line.',
    plural: 'n',
  },
  'library.addSuperset': {
    en: 'Add as superset',
    note: 'Floating button when two or more exercises are selected: add them as a superset. One line.',
  },
  'library.addCount_one': {
    en: 'Add {count} exercise',
    note: 'Floating primary button: add one selected exercise. One line.',
  },
  'library.addCount_other': {
    en: 'Add {count} exercises',
    note: 'Floating primary button: add several selected exercises; {count} is a number. One line.',
  },
  'library.selectHint': {
    en: 'Selects this exercise',
    note: 'Screen-reader hint of an exercise row in pick mode. Not visible.',
  },
  'library.opensHint': {
    en: 'Opens exercise details',
    note: 'Screen-reader hint of an exercise row when browsing. Not visible.',
  },
  'library.aboutLabel': {
    en: 'About {name}',
    note: 'Screen-reader label of the info button on an exercise row; {name} is the exercise name. Not visible.',
  },
  'exerciseDetail.loadFailed': {
    en: 'Failed to load exercise',
    note: 'Error line on the exercise detail screen when loading fails with no detail.',
  },
  'exerciseDetail.loadingTitle': {
    en: 'Loading',
    note: 'Header title of the exercise detail screen while the exercise loads. No ellipsis.',
  },
  'exerciseDetail.fallbackTitle': {
    en: 'Exercise',
    note: 'Header title of the exercise detail screen when the exercise has no name.',
  },
  'exerciseDetail.tabAbout': {
    en: 'About',
    note: 'Tab label on the exercise detail screen: description, muscles and how-to. Max 10 characters; fixed-width tab.',
  },
  'exerciseDetail.tabHistory': {
    en: 'History',
    note: 'Tab label on the exercise detail screen: past sessions. Max 10 characters; fixed-width tab.',
  },
  'exerciseDetail.tabCharts': {
    en: 'Charts',
    note: 'Tab label on the exercise detail screen: progress charts. Max 10 characters; fixed-width tab.',
  },
  'exerciseDetail.selectedRemove': {
    en: 'Selected · Remove',
    note: 'Bottom bar button when the exercise is already picked; tapping removes it. One line.',
  },
  'exerciseDetail.select': {
    en: 'Select exercise',
    note: 'Bottom bar button that picks this exercise. One line.',
  },
  'exerciseDetail.chipPrimary': {
    en: 'PRIMARY',
    note: 'Caption of the card showing the primary muscle. Upper case in English. Max 10 characters; three cards share a row.',
  },
  'exerciseDetail.chipSecondary': {
    en: 'SECONDARY',
    note: 'Caption of the card showing the secondary muscle. Upper case in English. Max 10 characters; three cards share a row.',
  },
  'exerciseDetail.chipEquip': {
    en: 'EQUIP',
    note: 'Caption of the card showing the equipment. Upper case in English; abbreviation of equipment. Max 8 characters; three cards share a row.',
  },
  'exerciseDetail.howTo': {
    en: 'HOW TO',
    note: 'Section label above the how-to steps. Upper case in English.',
  },
  'exerciseDetail.noSteps': {
    en: 'No instructions yet.',
    note: 'Line shown when the exercise has no how-to steps.',
  },
  'exerciseDetail.noHistory': {
    en: 'No history yet.',
    note: 'Line shown on the History tab when the exercise has never been trained.',
  },
  'exerciseDetail.pr': {
    en: 'PR',
    note: 'Pill on a past session that set a personal record. Keep short. Max 4 characters.',
  },
  'exerciseDetail.best': {
    en: 'BEST',
    note: 'Pill on a single set that was the personal best. Upper case in English. Max 6 characters.',
  },
  'exerciseDetail.rec.bestSet': {
    en: 'BEST SET',
    note: 'Record card and chart caption: the heaviest set. Upper case in English.',
  },
  'exerciseDetail.rec.est1rm': {
    en: 'EST. 1RM',
    note: 'Record card and chart caption: estimated one-rep max. Upper case in English. Keep 1RM untranslated.',
  },
  'exerciseDetail.rec.bestVolume': {
    en: 'BEST VOLUME',
    note: 'Record card and chart caption: most total weight in one session. Upper case in English.',
  },
  'exerciseDetail.rec.maxReps': {
    en: 'MAX REPS',
    note: 'Record card and chart caption: most reps in one set. Upper case in English.',
  },
  'exerciseDetail.noTrend': {
    en: 'Not enough sessions for a trend',
    note: 'Caption beside a chart title when there are too few sessions to show a trend.',
  },
  'exerciseDetail.flat': {
    en: '→ flat',
    note: 'Caption beside a chart title: the trend is flat. Keep the arrow.',
  },
  'exerciseDetail.perMonth': {
    en: '{delta} {unit} / mo',
    note: 'Caption beside a chart title: change per month; {delta} is an arrow and a signed number such as ↑ +1.5, {unit} is kg, lb or reps.',
  },
  'exerciseDetail.openCalc': {
    en: 'Open the 1RM calculator with this set',
    note: 'Screen-reader hint of the EST. 1RM record card. Not visible.',
  },
  'exerciseDetail.pointLabel': {
    en: 'Point {n}',
    note: 'Screen-reader fallback label of a chart point with no date; {n} is its position. Not visible.',
  },
  'exerciseDetail.range.3M': {
    en: '3M',
    note: 'Chart range button: last 3 months. Max 5 characters; fixed-width segment.',
  },
  'exerciseDetail.range.6M': {
    en: '6M',
    note: 'Chart range button: last 6 months. Max 5 characters; fixed-width segment.',
  },
  'exerciseDetail.range.1Y': {
    en: '1Y',
    note: 'Chart range button: last year. Max 5 characters; fixed-width segment.',
  },
  'exerciseDetail.range.ALL': {
    en: 'ALL',
    note: 'Chart range button: all time. Upper case in English. Max 5 characters; fixed-width segment.',
  },
  'health.ios.connect': {
    en: 'Connect Apple Health',
    note: 'The big connect button on the Health screen before connecting. One line. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.settingsSub': {
    en: 'Save finished workouts to Fitness',
    note: 'Sub line under the Health row in Settings. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.device': {
    en: 'This iPhone',
    note: 'Device phrase in "{device} · asked 12 Jun" on the Health screen. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.intro': {
    en: 'Save finished workouts as Traditional Strength Training, and read heart rate and calories live from your Apple Watch.',
    note: 'Intro paragraph on the Health screen before connecting. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.next': {
    en: 'iOS asks you, not us. Ischys is told whether it may write, but never whether it may read — so afterwards this screen shows what data actually arrives instead of a permission list.',
    note: 'Paragraph under WHAT HAPPENS NEXT on the Health screen before the system takes over the permission screen. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.disconnectBody': {
    en: 'Ischys will stop reading and writing Health data. Any records already written stay in Health.',
    note: 'Message of the Disconnect confirmation alert. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.unavailable': {
    en: 'Apple Health needs a device build with HealthKit — it is not available on the simulator.',
    note: 'Alert message when Health is not available on this device. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.writeAllowed': {
    en: 'Allowed in Health',
    note: 'Status of the Save finished workouts row when permission is granted. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.writeDenied': {
    en: 'Denied in Health',
    note: 'Status of the Save finished workouts row when permission is refused. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.writeDeniedExplainer': {
    en: 'Health is blocking writes, so finished workouts aren\'t being saved there. Only you can change this — Ischys can\'t ask again.',
    note: 'Explanation under the Save finished workouts row when writing is blocked. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.writeDeniedCta': {
    en: 'Open Health → Sharing → Ischys',
    note: 'Link under the write-blocked explanation. Keep Health and Ischys product names. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readsNote': {
    en: 'iOS never tells apps whether a read was allowed. These choose what Ischys asks for — Health decides what it returns.',
    note: 'Note under the ISCHYS ASKS HEALTH FOR heading. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readDenied': {
    en: 'Nothing received yet',
    note: 'Status text of a Health read row that has no data or no permission. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readDeniedExplainer': {
    en: 'This means one of two things, and iOS won\'t say which: Health is holding the data back, or nothing has recorded any yet.',
    note: 'Explanation shown when a Health read row is expanded and nothing can arrive. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.checkCta': {
    en: 'Check in the Health app',
    note: 'Link under a read row explainer. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.privacyNote': {
    en: 'Health data stays on this device. Ischys reads only what it writes back.',
    note: 'Privacy note at the bottom of the Health screens. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readHR.label': {
    en: 'Heart rate',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readHR.offDesc': {
    en: 'Live BPM from an Apple Watch',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readHR.explainer': {
    en: 'This means one of two things, and iOS won\'t say which: Health is holding the data back, or nothing has recorded any yet. Heart rate needs an Apple Watch worn during the session.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readEnergy.label': {
    en: 'Active energy',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readEnergy.offDesc': {
    en: 'Calories burned per session',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readEnergy.explainer': {
    en: 'This means one of two things, and iOS won\'t say which: Health is holding the data back, or nothing has recorded any yet. Active energy needs an Apple Watch worn during the session.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readBody.label': {
    en: 'Waist and body fat',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readBody.offDesc': {
    en: 'Into your measurement history',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.readBody.explainer': {
    en: 'These are the only body measurements HealthKit has a type for — the rest of your measurements are logged here and stay here. Nothing is written back to Health.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.useForBodyweight': {
    en: 'Use Apple Health',
    note: 'Button in the bodyweight sheet that reads the weight from Health. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.ios.noBodyweight': {
    en: 'No bodyweight in Apple Health',
    note: 'Toast shown when Health has no weight to read. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.connect': {
    en: 'Connect to Health Connect',
    note: 'The big connect button on the Health screen before connecting. One line. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.settingsSub': {
    en: 'Save finished workouts, read heart rate',
    note: 'Sub line under the Health row in Settings. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.device': {
    en: 'This phone',
    note: 'Device phrase in "{device} · asked 12 Jun" on the Health screen. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.intro': {
    en: 'Save finished workouts as strength training, and read the heart rate and calories your watch or band recorded for them.',
    note: 'Intro paragraph on the Health screen before connecting. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.next': {
    en: 'Android asks you, not us. You choose exactly what Ischys may write and what it may read, and can change either in Health Connect at any time. This screen then shows what you allowed and what data actually arrives.',
    note: 'Paragraph under WHAT HAPPENS NEXT on the Health screen before the system takes over the permission screen. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.disconnectBody': {
    en: 'Ischys will stop reading and writing Health Connect data. Any records already written stay in Health Connect.',
    note: 'Message of the Disconnect confirmation alert. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.unavailable': {
    en: 'Health Connect is not available on this device.',
    note: 'Alert message when Health is not available on this device. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.writeAllowed': {
    en: 'Allowed in Health Connect',
    note: 'Status of the Save finished workouts row when permission is granted. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.writeDenied': {
    en: 'Not allowed in Health Connect',
    note: 'Status of the Save finished workouts row when permission is refused. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.writeDeniedExplainer': {
    en: 'Ischys isn\'t allowed to write exercise, so finished workouts aren\'t being saved to Health Connect. You can allow it there.',
    note: 'Explanation under the Save finished workouts row when writing is blocked. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.writeDeniedCta': {
    en: 'Open Health Connect',
    note: 'Link under the write-blocked explanation. Keep Health and Ischys product names. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readsNote': {
    en: 'These choose what Ischys asks for. What it may read is yours to allow in Health Connect.',
    note: 'Note under the ISCHYS ASKS HEALTH FOR heading. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readDenied': {
    en: 'Not allowed in Health Connect',
    note: 'Status text of a Health read row that has no data or no permission. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readDeniedExplainer': {
    en: 'Ischys isn\'t allowed to read this, so nothing can arrive. You can allow it in Health Connect.',
    note: 'Explanation shown when a Health read row is expanded and nothing can arrive. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.checkCta': {
    en: 'Open Health Connect',
    note: 'Link under a read row explainer. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.privacyNote': {
    en: 'Health data stays on this device. Ischys also reads your latest weight, for bodyweight exercises.',
    note: 'Privacy note at the bottom of the Health screens. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readHR.label': {
    en: 'Heart rate',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readHR.offDesc': {
    en: 'Average and max per session',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readHR.explainer': {
    en: 'Reading is allowed, but Health Connect has had no heart rate for a workout yet. It needs a watch or band that syncs to Health Connect, worn during the session.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readEnergy.label': {
    en: 'Active energy',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readEnergy.offDesc': {
    en: 'Calories burned per session',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readEnergy.explainer': {
    en: 'Reading is allowed, but Health Connect has had no active calories for a workout yet. They need a watch or band that syncs to Health Connect, worn during the session.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readBody.label': {
    en: 'Body fat',
    note: 'Label of a Health read row. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readBody.offDesc': {
    en: 'Into your measurement history',
    note: 'Description of a Health read row when it is switched off. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.readBody.explainer': {
    en: 'Reading is allowed, but Health Connect holds no body fat reading yet. It is the only body measurement Health Connect shares with your list — the rest are logged here and stay here. Nothing is written back.',
    note: 'Explanation shown when a Health read row is expanded and nothing has arrived. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.useForBodyweight': {
    en: 'Use Health Connect',
    note: 'Button in the bodyweight sheet that reads the weight from Health. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.android.noBodyweight': {
    en: 'No bodyweight in Health Connect',
    note: 'Toast shown when Health has no weight to read. Keep the product names (Apple Health, Health Connect, Apple Watch, Ischys) untranslated.',
  },
  'health.thisPhone': {
    en: 'this phone',
    note: 'Mid-sentence device phrase on Android, e.g. "Health Connect on this phone belongs to…". Lower case.',
  },
  'health.thisIphone': {
    en: 'this iPhone',
    note: 'Mid-sentence device phrase on iOS, e.g. "Apple Health on this iPhone belongs to…". Lower case. Keep iPhone.',
  },
  'health.offFor': {
    en: 'Off for {name}',
    note: 'Title on the Health screen in a profile that is not the phone owner; {name} is that profile first name.',
  },
  'health.offBody': {
    en: '{health} on {device} belongs to {owner}. {whose} workouts stay in Ischys.',
    note: 'Body on the Health screen in a non-owner profile; {health} is Apple Health or Health Connect, {device} is this phone or this iPhone, {owner} is a person name or the phone owner phrase, {whose} is a possessive name.',
  },
  'health.ownerPossessive': {
    en: 'the phone\'s owner\'s',
    note: 'Possessive of the phone owner phrase, used mid-sentence. Lower case.',
  },
  'health.offLine': {
    en: 'Health and the Watch work only in {whose} profile.',
    note: 'Line on the Health screen in a non-owner profile; {whose} is a possessive such as Tom\'s or the phone\'s owner\'s.',
  },
  'health.recently': {
    en: 'recently',
    note: 'Fragment in "asked recently" when the date the user connected is unknown. Lower case.',
  },
  'health.needTitle': {
    en: 'Health Connect needed',
    note: 'Alert title when the Health Connect app is missing on Android. Keep the product name.',
  },
  'health.needBody': {
    en: 'Install or update Health Connect from Google Play, then come back here to connect.',
    note: 'Alert message when the Health Connect app is missing on Android. Keep the product names.',
  },
  'health.getHc': {
    en: 'Get Health Connect',
    note: 'Alert button that opens the Health Connect page on Google Play. Keep the product name.',
  },
  'health.notAvailable': {
    en: 'Not available',
    note: 'Alert title when Health is not available on this device.',
  },
  'health.nothingAllowedTitle': {
    en: 'Nothing allowed yet',
    note: 'Alert title after the Android permission prompt was dismissed with nothing allowed.',
  },
  'health.nothingAllowedBody': {
    en: 'Ischys connects once you allow at least one thing. You can also allow them in Health Connect.',
    note: 'Alert message after the Android permission prompt was dismissed with nothing allowed. Keep the product names.',
  },
  'health.openHc': {
    en: 'Open Health Connect',
    note: 'Alert button that opens the Health Connect settings. Keep the product name.',
  },
  'health.disconnectTitle': {
    en: 'Disconnect {name}',
    note: 'Title of the disconnect alert, and the destructive button label on the Health screen; {name} is Apple Health or Health Connect.',
  },
  'health.disconnect': {
    en: 'Disconnect',
    note: 'Destructive button in the disconnect alert. Max 12 characters.',
  },
  'health.whatNext': {
    en: 'WHAT HAPPENS NEXT',
    note: 'Heading of the explainer card on the Health screen before connecting. Upper case in English.',
  },
  'health.nextRich': {
    en: 'iOS asks you, not us. Ischys is told whether it may {write}, but never whether it may {read} — so afterwards this screen shows what data actually arrives instead of a permission list.',
    note: 'Explainer paragraph on the Health screen before connecting (iOS). {write} and {read} are replaced with the two emphasised words from health.writeWord and health.readWord. Keep both placeholders.',
  },
  'health.writeWord': {
    en: 'write',
    note: 'Single emphasised word inserted into health.nextRich for the {write} placeholder. Lower case.',
  },
  'health.readWord': {
    en: 'read',
    note: 'Single emphasised word inserted into health.nextRich for the {read} placeholder. Lower case.',
  },
  'health.privacy': {
    en: 'Health data never leaves your device.',
    note: 'Privacy note at the bottom of the Health screen before connecting.',
  },
  'health.linked': {
    en: 'Linked to {name}',
    note: 'Title of the status card once connected; {name} is Apple Health or Health Connect.',
  },
  'health.deviceAsked': {
    en: '{device} · asked {date}',
    note: 'Sub line of the status card; {device} is This iPhone or This phone, {date} is a short date such as 12 Jun or "recently".',
  },
  'health.writes': {
    en: 'ISCHYS WRITES',
    note: 'Section label above the Save finished workouts row on the Health screen. Upper case in English. Keep Ischys.',
  },
  'health.saveWorkouts': {
    en: 'Save finished workouts',
    note: 'Row label and screen-reader label of the switch that saves finished workouts to Health.',
  },
  'health.reassure': {
    en: 'Your workouts are still saved in Ischys. Nothing is lost.',
    note: 'Reassurance shown when writing to Health is blocked.',
  },
  'health.asks': {
    en: 'ISCHYS ASKS HEALTH FOR',
    note: 'Section label above the Health read rows. Upper case in English. Keep Ischys.',
  },
  'health.workoutsWritten': {
    en: 'WORKOUTS WRITTEN',
    note: 'Caption of a stat cell: how many workouts were saved to Health. Upper case in English. Max 18 characters; two cells share a row.',
  },
  'health.lastSynced': {
    en: 'LAST SYNCED',
    note: 'Caption of a stat cell: when Health was last synced. Upper case in English. Max 18 characters; two cells share a row.',
  },
  'health.receiving': {
    en: 'Receiving · {value} last session',
    note: 'Status of a Health read row that received data; {value} is a reading such as 132 bpm.',
  },
  'health.nothingYet': {
    en: 'Nothing received yet',
    note: 'Status of a Health read row that has received nothing.',
  },
  'common.ok': {
    en: 'OK',
    note: 'Generic OK button that dismisses an alert. Max 6 characters.',
  },
  'scope.thisPhone': {
    en: 'THIS PHONE',
    note: 'Label prefix on a Settings section whose settings apply to every profile on the phone. Upper case in English. Max 14 characters.',
  },
  'settings.title': {
    en: 'Settings',
    note: 'Title of the Settings screen.',
  },
  'settings.units': {
    en: 'Units',
    note: 'Settings row label for the weight unit; options KG and LB.',
  },
  'settings.effort': {
    en: 'Effort per set',
    note: 'Settings row label for the effort rating setting; options Off, RPE and RIR.',
  },
  'settings.effortOption': {
    en: 'Effort per set: {option}',
    note: 'Screen-reader label of one option of the effort setting; {option} is Off, RPE or RIR. Not visible.',
  },
  'settings.effortHelpRpe': {
    en: 'Rate a set while you rest. RPE runs 6 to 10, where 10 means nothing left and 8 means two reps left.',
    note: 'Help text under the effort setting when Off or RPE is selected.',
  },
  'settings.effortHelpRir': {
    en: 'Rate a set while you rest. RIR counts the reps you had left, where 0 means nothing left.',
    note: 'Help text under the effort setting when RIR is selected.',
  },
  'settings.effortFooter': {
    en: 'Turning this off hides ratings everywhere but keeps them stored. Switching between RPE and RIR converts existing ratings.',
    note: 'Footer under the TRAINING section in Settings explaining the effort setting.',
  },
  'settings.autoRest': {
    en: 'Auto-start rest timer',
    note: 'Settings toggle label: start the rest timer automatically after a set.',
  },
  'settings.keepNotes': {
    en: 'Keep exercise notes',
    note: 'Settings toggle label: carry exercise notes into the next workout.',
  },
  'settings.keepNotes.sub': {
    en: 'Carry each exercise\'s note into your next workouts until you change or clear it',
    note: 'Sub line under the Keep exercise notes toggle.',
  },
  'settings.restAlerts': {
    en: 'Rest timer alerts',
    note: 'Settings toggle label: notify when the rest timer ends.',
  },
  'settings.haptics': {
    en: 'Haptic feedback',
    note: 'Settings toggle label: vibration feedback.',
  },
  'settings.warmups': {
    en: 'Count warmups in volume',
    note: 'Settings toggle label: include warm-up sets in the volume total.',
  },
  'settings.deload': {
    en: 'Deload advice',
    note: 'Settings toggle label: show deload suggestions after workouts.',
  },
  'settings.platesSub': {
    en: 'Used by the plate calculator',
    note: 'Sub line under the Bar & plates row in Settings.',
  },
  'settings.weeklyGoal': {
    en: 'Weekly goal',
    note: 'Settings row label for the weekly workout target.',
  },
  'settings.weeklyGoalSub': {
    en: 'Workouts a week, shown on Home',
    note: 'Sub line under the Weekly goal row.',
  },
  'settings.goalDown': {
    en: 'Decrease weekly goal',
    note: 'Screen-reader label of the minus button of the weekly goal. Not visible.',
  },
  'settings.goalUp': {
    en: 'Increase weekly goal',
    note: 'Screen-reader label of the plus button of the weekly goal. Not visible.',
  },
  'settings.bodyweight': {
    en: 'Bodyweight',
    note: 'Settings row label and title of the bodyweight sheet.',
  },
  'settings.bodyweightSub': {
    en: 'Counts toward volume for bodyweight moves',
    note: 'Sub line under the Bodyweight row in Settings.',
  },
  'settings.notSet': {
    en: 'Not set',
    note: 'Value of the Bodyweight row when no bodyweight is stored.',
  },
  'settings.bodyweightText': {
    en: 'Used to count bodyweight movements — pull-ups, dips, push-ups — toward your volume. It\'s snapshotted onto each workout, so changing it never rewrites past sessions.',
    note: 'Explanation in the bodyweight sheet.',
  },
  'settings.bodyweightField': {
    en: 'Bodyweight value',
    note: 'Screen-reader label of the bodyweight number input. Not visible.',
  },
  'settings.appearance': {
    en: 'Appearance',
    note: 'Settings row label for the light/dark appearance; options Dark, Light and System.',
  },
  'settings.following': {
    en: 'Following {device} · {scheme}',
    note: 'Sub line under Appearance while System is selected; {device} is iPhone or phone, {scheme} is Dark or Light.',
  },
  'settings.deviceIos': {
    en: 'iPhone',
    note: 'Device name in "Following iPhone". Keep iPhone.',
  },
  'settings.devicePhone': {
    en: 'phone',
    note: 'Device name in "Following phone". Lower case.',
  },
  'settings.dark': {
    en: 'Dark',
    note: 'Appearance option and scheme name: dark mode. Max 8 characters; segmented control.',
  },
  'settings.light': {
    en: 'Light',
    note: 'Appearance option and scheme name: light mode. Max 8 characters; segmented control.',
  },
  'settings.system': {
    en: 'System',
    note: 'Appearance option: follow the system setting. Max 8 characters; segmented control.',
  },
  'settings.theme': {
    en: 'Theme',
    note: 'Settings row label for the accent colour theme; the value is the theme name.',
  },
  'settings.language': {
    en: 'Language',
    note: 'Settings row label: the language the app is shown in. Its value is System or a language name written in that language.',
  },
  'settings.languageFollowing': {
    en: 'Following {device} · {language}',
    note: 'Sub line under the System language option and the Language row; {device} is iPhone or phone, {language} is a language name in its own language (English, 简体中文, Русский). Keep it short.',
  },
  'settings.languageFooterIos': {
    en: 'Apple Health prompts and system menus follow the iPhone language.',
    note: 'Footer under the language list on iPhone: iOS draws these itself, so this setting does not change them.',
  },
  'settings.languageFooterAndroid': {
    en: 'Health Connect prompts and system menus follow the phone language.',
    note: 'Footer under the language list on Android: Android draws these itself, so this setting does not change them.',
  },
  'settings.sectionProfile': {
    en: 'PROFILE',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.profileFooter': {
    en: 'Keep separate history for a client or someone you share this phone with.',
    note: 'Footer under the PROFILE section in Settings when there is only one profile.',
  },
  'settings.profilesOnPhone': {
    en: '{count} PROFILES ON THIS PHONE',
    note: 'Sub line of the profile row in Settings with several profiles. Upper case in English.',
    plural: 'count',
  },
  'settings.justYou': {
    en: 'JUST YOU',
    note: 'Sub line of the profile row in Settings with one profile. Upper case in English.',
  },
  'settings.managePerson': {
    en: '{name}, manage profiles',
    note: 'Screen-reader label of the profile row in Settings; {name} is the profile name. Not visible.',
  },
  'settings.sectionTraining': {
    en: 'TRAINING',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.sectionData': {
    en: 'DATA',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.sectionAppearance': {
    en: 'APPEARANCE',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.sectionAlerts': {
    en: 'ALERTS',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.sectionDevice': {
    en: 'DEVICE',
    note: 'Settings section title above the Health row. Upper case in English.',
  },
  'settings.sectionAbout': {
    en: 'ABOUT',
    note: 'Settings section title. Upper case in English.',
  },
  'settings.phoneFooter': {
    en: 'Settings marked THIS PHONE are the same in every profile.',
    note: 'Footer under the APPEARANCE section in Settings with several profiles. Keep it consistent with scope.thisPhone.',
  },
  'settings.exportWhose': {
    en: 'Export {whose} data',
    note: 'Settings row label with several profiles; {whose} is a possessive name such as Tom\'s.',
  },
  'settings.importInto': {
    en: 'Import into {name}',
    note: 'Settings row label with several profiles; {name} is the profile first name.',
  },
  'settings.inHistory': {
    en: 'IN {whose} HISTORY',
    note: 'Sub line of the Merge duplicates row with several profiles; {whose} is an upper-case possessive name. Upper case in English.',
  },
  'settings.importWorkout': {
    en: 'Import workout',
    note: 'Settings row label for importing a workout file.',
  },
  'settings.mergeSub': {
    en: 'Same lift saved twice',
    note: 'Sub line under the Merge duplicates row.',
  },
  'settings.privacy': {
    en: 'Privacy',
    note: 'Settings row label and title of the privacy alert.',
  },
  'settings.onDevice': {
    en: 'On-device',
    note: 'Value of the Privacy row: data stays on the device.',
  },
  'settings.backupIos': {
    en: 'iCloud',
    note: 'Backup service name on iOS inside the privacy alert. Keep the product name.',
  },
  'settings.backupAndroid': {
    en: 'your Google account',
    note: 'Backup account phrase on Android inside the privacy alert. Lower case, used mid-sentence.',
  },
  'settings.privacyBody': {
    en: 'All your workout data lives on this device only. Nothing is sent to any server or third party. It backs up with your device ({backup}) like any other app.',
    note: 'Message of the privacy alert; {backup} is iCloud or your Google account.',
  },
  'settings.privacyPolicy': {
    en: 'Privacy policy',
    note: 'Alert button that opens the privacy policy web page.',
  },
  'settings.sourceCode': {
    en: 'Source code',
    note: 'Settings row label that opens the GitHub repository.',
  },
  'settings.aboutRow': {
    en: 'About Ischys',
    note: 'Settings row label that opens the about alert. Keep Ischys.',
  },
  'settings.aboutBody': {
    en: 'Private, on-device workout tracker.\n\nversion {version}\n\nExercise artwork by Workout Guide and Everkinetic, licensed\nCC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0).\n\nΙσχύς — strength.',
    note: 'Message of the About alert; keep the line breaks, the licence name and URL, and the Greek word.',
  },
  'import.title': {
    en: 'Import history',
    note: 'Title of the import screen. One line.',
  },
  'import.close': {
    en: 'Close',
    note: 'Screen-reader label of the X button on the import screen. Not visible.',
  },
  'import.chooseTitle': {
    en: 'Choose an export to import',
    note: 'Title in the file drop zone on the import screen.',
  },
  'import.chooseSub': {
    en: 'Point Ischys at an Ischys JSON backup or a workout CSV export and we\'ll load every set into your log.',
    note: 'Body in the file drop zone. Keep Ischys, JSON and CSV untranslated.',
  },
  'import.browse': {
    en: 'Browse files',
    note: 'Button that opens the system file picker, and its screen-reader label. One line.',
  },
  'import.whatImported': {
    en: 'WHAT GETS IMPORTED',
    note: 'Section label above the checklist of imported data. Upper case in English.',
  },
  'import.check1': {
    en: 'Every set with weight × reps',
    note: 'Checklist line: what the import brings in.',
  },
  'import.check2': {
    en: 'Workout names, dates, and exercise groupings',
    note: 'Checklist line: what the import brings in.',
  },
  'import.check3': {
    en: 'Set types (warmup / drop / failure) mapped to Ischys',
    note: 'Checklist line: what the import brings in. Keep Ischys untranslated.',
  },
  'import.check4': {
    en: 'Notes on workouts and exercises',
    note: 'Checklist line: what the import brings in.',
  },
  'import.supported': {
    en: 'Supported: {json} (a full backup) and a {csv}. Cardio-only CSV rows (distance/duration without weight × reps) are skipped.',
    note: 'Fine print on the import screen; {json} and {csv} are replaced by bold phrases from import.supportedJson and import.supportedCsv. Keep both placeholders.',
  },
  'import.supportedJson': {
    en: 'Ischys JSON',
    note: 'Bold phrase inserted into import.supported for {json}. Keep Ischys and JSON untranslated.',
  },
  'import.supportedCsv': {
    en: 'workout CSV',
    note: 'Bold phrase inserted into import.supported for {csv}. Keep CSV untranslated.',
  },
  'import.failed': {
    en: 'Import failed',
    note: 'Error banner text when an import fails with no detail.',
  },
  'import.selectedFile': {
    en: 'SELECTED FILE',
    note: 'Caption above the chosen file name. Upper case in English.',
  },
  'import.changeFile': {
    en: 'Change file',
    note: 'Button and screen-reader label that chooses another file. Max 14 characters.',
  },
  'import.reading': {
    en: 'Reading file…',
    note: 'Hint while the chosen file is being read. Keep the ellipsis.',
  },
  'import.unsupported': {
    en: 'This doesn\'t look like an Ischys JSON backup or a workout CSV. Pick one of those and try again.',
    note: 'Hint when the chosen file is not a supported format. Keep Ischys, JSON and CSV untranslated.',
  },
  'import.statWorkouts': {
    en: 'WORKOUTS',
    note: 'Caption of a stat cell in the import preview. Upper case in English. Max 10 characters; three cells share a row.',
  },
  'import.statExercises': {
    en: 'EXERCISES',
    note: 'Caption of a stat cell in the import preview. Upper case in English. Max 10 characters; three cells share a row.',
  },
  'import.statSets': {
    en: 'SETS',
    note: 'Caption of a stat cell in the import preview. Upper case in English. Max 10 characters; three cells share a row.',
  },
  'import.skipCardio': {
    en: '{count} rows will be skipped (cardio / rest-only)',
    note: 'Note in the import preview; {count} is a number of CSV rows.',
    plural: 'count',
  },
  'import.skipNoName': {
    en: '{count} rows will be skipped (no exercise name)',
    note: 'Note in the import preview; {count} is a number of CSV rows.',
    plural: 'count',
  },
  'import.weightUnit': {
    en: 'WEIGHT UNIT',
    note: 'Caption above the KG/LB selector in the import preview. Upper case in English.',
  },
  'import.unitUnknown': {
    en: 'This file doesn\'t say, so weights are read as {unit}',
    note: 'Note under the weight unit selector; {unit} is KG or LB.',
  },
  'import.firstWorkouts': {
    en: 'FIRST WORKOUTS',
    note: 'Caption above a short list of the first workouts found in the file. Upper case in English.',
  },
  'import.setsCount_one': {
    en: '{count} set',
    note: 'Number of sets in a previewed workout, one set. Lower case in English.',
  },
  'import.setsCount_other': {
    en: '{count} sets',
    note: 'Number of sets in a previewed workout. Lower case in English.',
  },
  'import.importFile': {
    en: 'Import file',
    note: 'Disabled import button label when the file is unsupported.',
  },
  'import.importCount_one': {
    en: 'Import {count} workout{into}{unit}',
    note: 'Import button label for one workout; {into} is an optional phrase such as " into Tom" (import.into), {unit} is an optional phrase such as " as KG" (import.asUnit); both may be empty.',
  },
  'import.importCount_other': {
    en: 'Import {count} workouts{into}{unit}',
    note: 'Import button label for several workouts; {into} is an optional phrase such as " into Tom" (import.into), {unit} is an optional phrase such as " as KG" (import.asUnit); both may be empty.',
  },
  'import.into': {
    en: ' into {name}',
    note: 'Optional phrase inside the import button label; keep the leading space; {name} is the profile first name.',
  },
  'import.asUnit': {
    en: ' as {unit}',
    note: 'Optional phrase inside the import button label; keep the leading space; {unit} is KG or LB.',
  },
  'import.importing': {
    en: 'Importing…',
    note: 'Caption under the progress ring while importing. Keep the ellipsis.',
  },
  'import.done': {
    en: 'History imported',
    note: 'Title on the import success screen.',
  },
  'import.doneStats': {
    en: '{workouts} workouts · {exercises} exercises · {sets} sets',
    note: 'Line on the import success screen; all three are numbers.',
  },
  'import.rowsSkipped': {
    en: '{count} rows skipped',
    note: 'Line on the import success screen; {count} is a number of CSV rows.',
    plural: 'count',
  },
  'import.footnote': {
    en: 'You can save more later from History.',
    note: 'Footnote under the routines card on the import success screen.',
  },
  'import.tryAgain': {
    en: 'Try again',
    note: 'Button on the import error screen, and its screen-reader label. One line.',
  },
  'import.routines': {
    en: 'ROUTINES',
    note: 'Small caption of the routines card on the import success screen. Upper case in English.',
  },
  'import.routinesHeading': {
    en: 'Save any as routines?',
    note: 'Heading of the routines card on the import success screen.',
  },
  'import.routinesBody': {
    en: 'Your import restored sessions, not routines. Pick the ones you still train. Each is built from its most recent session.',
    note: 'Body of the routines card on the import success screen.',
  },
  'import.lastTrained': {
    en: 'LAST TRAINED',
    note: 'Right-hand column header of the list of workout titles. Upper case in English.',
  },
  'import.candidateHint': {
    en: 'Saves this as a routine',
    note: 'Screen-reader hint of a workout title row. Not visible.',
  },
  'import.seenOnceHint': {
    en: 'Shows the titles trained once',
    note: 'Screen-reader hint of the collapsed row. Not visible.',
  },
  'import.retry': {
    en: 'Retry',
    note: 'Footer button after some routines failed to be created.',
  },
  'import.skip': {
    en: 'Skip',
    note: 'Footer text button that leaves without creating routines. Max 8 characters.',
  },
  'import.sessions_one': {
    en: '{count} SESSION',
    note: 'Meta under a workout title: sessions count, one. Upper case in English.',
  },
  'import.sessions_other': {
    en: '{count} SESSIONS',
    note: 'Meta under a workout title: sessions count. Upper case in English.',
  },
  'import.exercisesMeta_one': {
    en: '{count} EXERCISE',
    note: 'Meta under a workout title: exercises count, one. Upper case in English.',
  },
  'import.exercisesMeta_other': {
    en: '{count} EXERCISES',
    note: 'Meta under a workout title: exercises count. Upper case in English.',
  },
  'import.titles_one': {
    en: '{count} TITLE',
    note: 'Left column header of the list of workout titles, one. Upper case in English.',
  },
  'import.titles_other': {
    en: '{count} TITLES',
    note: 'Left column header of the list of workout titles. Upper case in English.',
  },
  'import.seenOnce': {
    en: '{count} MORE · SEEN ONCE',
    note: 'Collapsed row that expands titles trained only once; {count} is a number. Upper case in English.',
    plural: 'count',
  },
  'import.createRoutines_one': {
    en: 'Create {count} routine',
    note: 'Accent footer button: create one routine from the picked titles.',
  },
  'import.createRoutines_other': {
    en: 'Create {count} routines',
    note: 'Accent footer button: create several routines from the picked titles; {count} is a number.',
  },
  'import.partialFail': {
    en: 'Created {created} of {attempted} · {names} failed',
    note: 'Note under the footer button when some routines could not be created; {names} is a comma-separated list of titles.',
  },
  'import.warnDuplicates_one': {
    en: '{count} workout already imported, skipped',
    note: 'Import warning on the success screen: one workout was a duplicate.',
  },
  'import.warnDuplicates_other': {
    en: '{count} workouts already imported, skipped',
    note: 'Import warning on the success screen: several workouts were duplicates.',
  },
  'import.warnColumns': {
    en: 'Couldn\'t recognise this CSV\'s columns — nothing was imported',
    note: 'Import warning on the success screen when no CSV columns were recognised.',
  },
  'import.warnNoDate_one': {
    en: '{count} workout skipped (no valid date)',
    note: 'Import warning on the success screen: one workout had no valid date.',
  },
  'import.warnNoDate_other': {
    en: '{count} workouts skipped (no valid date)',
    note: 'Import warning on the success screen: several workouts had no valid date.',
  },
  'import.invalidJson': {
    en: 'Not a valid Ischys JSON export',
    note: 'Error banner when the chosen JSON file is not an Ischys export.',
  },
  'startFlow.body': {
    en: '“{name}” is still running. Finish or discard it before starting another.',
    note: 'Alert message when starting a workout while another is running; {name} is the running workout name (shown in quotes). Title is resume.title; buttons are Cancel and Resume.',
  },
  'demo.comingSoon': {
    en: 'Coming soon',
    note: 'Alert title for the not-yet-available local file upload for a demo video.',
  },
  'demo.comingSoonBody': {
    en: 'Local file upload will be added in a later release.',
    note: 'Alert message for the not-yet-available local file upload.',
  },
  'demo.artNote': {
    en: 'Illustration for reference — follow the steps below for form.',
    note: 'Note under the exercise artwork: the drawing is only a reference, the how-to steps give the form guidance.',
  },
  'demo.add': {
    en: 'Add a demo video →',
    note: 'Text link that opens the demo video editor. Keep the arrow.',
  },
  'demo.attribution': {
    en: 'Image · {author}',
    note: 'Credit line under an exercise image; {author} is the artist or source name.',
  },
  'demo.addLabel': {
    en: 'ADD DEMO',
    note: 'Label in the empty demo tile. Upper case in English. Max 12 characters.',
  },
  'demo.paste': {
    en: 'Paste URL',
    note: 'Chip in the empty demo tile that opens the URL editor. Max 14 characters.',
  },
  'demo.upload': {
    en: 'Upload file',
    note: 'Chip in the empty demo tile for uploading a file. Max 14 characters.',
  },
  'demo.source': {
    en: 'Source · {host}',
    note: 'Footer of a demo tile; {host} is a web domain such as youtube.com.',
  },
  'demo.change': {
    en: 'Change',
    note: 'Text button on a demo tile that opens the URL editor. Max 8 characters.',
  },
  'demo.urlTitle': {
    en: 'Demo URL',
    note: 'Title of the demo URL editor sheet.',
  },
  'demo.urlPlaceholder': {
    en: 'https://…/incline-db-press.mp4',
    note: 'Example URL in the demo URL input. Keep it as a URL.',
  },
  'demo.urlInvalid': {
    en: 'Enter an http(s) link to a video.',
    note: 'Error under the demo URL input when the text is not an http or https link.',
  },
  'demo.saveLabel': {
    en: 'Save demo URL',
    note: 'Screen-reader label of the Save button in the demo URL editor. Not visible.',
  },
  'musclePicker.noMatch': {
    en: 'No muscles match "{query}"',
    note: 'Empty-state line in the muscle picker; {query} is what the user typed.',
  },
  'musclePicker.search': {
    en: 'Search muscles',
    note: 'Placeholder of the search field in the muscle picker.',
  },
  'exerciseDetail.chartEmpty': {
    en: 'Not enough data yet.',
    note: 'Empty-state line inside a chart card on the exercise Charts tab.',
  },
  'restAlert.exactTitle': {
    en: 'Rest alerts on time',
    note: 'Android alert title asking to allow exact alarms so the rest timer alert is not delayed.',
  },
  'restAlert.exactBody': {
    en: 'Android can delay the end-of-rest alert by a minute or more unless Ischys is allowed to set alarms. Turn on "Alarms & reminders" for Ischys to get it on the second.',
    note: 'Android alert message; "Alarms & reminders" is the name of an Android system setting, translate it as Android does.',
  },
  'restAlert.openSettings': {
    en: 'Open settings',
    note: 'Android alert button that opens the system alarm settings.',
  },
  'workout.finishFailedBackground': {
    en: 'Nothing was changed. Open the workout and try again.',
    note: 'Alert message shown when finishing a workout from the Watch fails in the background; follows workout.finishFailedTitle.',
  },
  'profile.weekLetter.0': {
    en: 'M',
    note: 'One-letter initial of Monday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.1': {
    en: 'T',
    note: 'One-letter initial of Tuesday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.2': {
    en: 'W',
    note: 'One-letter initial of Wednesday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.3': {
    en: 'T',
    note: 'One-letter initial of Thursday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.4': {
    en: 'F',
    note: 'One-letter initial of Friday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.5': {
    en: 'S',
    note: 'One-letter initial of Saturday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
  'profile.weekLetter.6': {
    en: 'S',
    note: 'One-letter initial of Sunday under the weekly bars on the Profile tab (Monday-first, seven separate keys). Max 1 character.',
  },
};
