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
};
