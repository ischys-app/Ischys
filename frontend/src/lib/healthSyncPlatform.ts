/**
 * What differs between Apple Health and Health Connect on the surfaces that
 * talk about Health: the words, and how much is known about permissions.
 *
 * HealthKit hides read grants, so on iOS a read row can only say whether data
 * arrived (see healthReceipts.ts). Health Connect reports every grant, so on
 * Android the same row can also say the plain thing — "not allowed" — instead
 * of leaving the user to guess.
 *
 * Pure, and free of react-native so `node --test` covers it: callers pass
 * `Platform.OS` in.
 */
import type { ReadPref, Receipt } from './healthReceipts';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type ReadRowCopy = { label: string; offDesc: string; explainer: string };

export type HealthCopy = {
  /** The product's name: the screen title, the settings row, the buttons. */
  name: string;
  /** Under the name on the settings row. */
  settingsSub: string;
  /** The connect button. */
  connect: string;
  /** "This iPhone" in "This iPhone · asked 12 Jun". */
  device: string;
  intro: string;
  /** WHAT HAPPENS NEXT, before the system takes over the permission screen. */
  next: string;
  disconnectBody: string;
  unavailable: string;
  writeAllowed: string;
  writeDenied: string;
  writeDeniedExplainer: string;
  writeDeniedCta: string;
  readsNote: string;
  /** Android only: a read the user has not allowed. */
  readDenied: string;
  readDeniedExplainer: string;
  /** The link under a read row's explainer. */
  checkCta: string;
  privacyNote: string;
  reads: Record<ReadPref, ReadRowCopy>;
  /** The bodyweight sheet's button, and its toast when Health has no weight. */
  useForBodyweight: string;
  noBodyweight: string;
};

const IOS_UNSURE =
  "This means one of two things, and iOS won't say which: Health is holding the data back, or nothing has recorded any yet.";

const IOS: HealthCopy = {
  name: 'Apple Health',
  connect: 'Connect Apple Health',
  settingsSub: 'Save finished workouts to Fitness',
  device: 'This iPhone',
  intro:
    'Save finished workouts as Traditional Strength Training, and read heart rate and calories live from your Apple Watch.',
  next: 'iOS asks you, not us. Ischys is told whether it may write, but never whether it may read — so afterwards this screen shows what data actually arrives instead of a permission list.',
  disconnectBody:
    'Ischys will stop reading and writing Health data. Any records already written stay in Health.',
  unavailable:
    'Apple Health needs a device build with HealthKit — it is not available on the simulator.',
  writeAllowed: 'Allowed in Health',
  writeDenied: 'Denied in Health',
  writeDeniedExplainer:
    "Health is blocking writes, so finished workouts aren't being saved there. Only you can change this — Ischys can't ask again.",
  writeDeniedCta: 'Open Health → Sharing → Ischys',
  readsNote:
    'iOS never tells apps whether a read was allowed. These choose what Ischys asks for — Health decides what it returns.',
  readDenied: 'Nothing received yet',
  readDeniedExplainer: IOS_UNSURE,
  checkCta: 'Check in the Health app',
  privacyNote: 'Health data stays on this device. Ischys reads only what it writes back.',
  reads: {
    readHR: {
      label: 'Heart rate',
      offDesc: 'Live BPM from an Apple Watch',
      explainer: `${IOS_UNSURE} Heart rate needs an Apple Watch worn during the session.`,
    },
    readEnergy: {
      label: 'Active energy',
      offDesc: 'Calories burned per session',
      explainer: `${IOS_UNSURE} Active energy needs an Apple Watch worn during the session.`,
    },
    readBody: {
      label: 'Waist and body fat',
      offDesc: 'Into your measurement history',
      explainer:
        'These are the only body measurements HealthKit has a type for — the rest of your measurements are logged here and stay here. Nothing is written back to Health.',
    },
  },
  useForBodyweight: 'Use Apple Health',
  noBodyweight: 'No bodyweight in Apple Health',
};

const ANDROID: HealthCopy = {
  name: 'Health Connect',
  connect: 'Connect to Health Connect',
  settingsSub: 'Save finished workouts, read heart rate',
  device: 'This phone',
  intro:
    'Save finished workouts as strength training, and read the heart rate and calories your watch or band recorded for them.',
  next: 'Android asks you, not us. You choose exactly what Ischys may write and what it may read, and can change either in Health Connect at any time. This screen then shows what you allowed and what data actually arrives.',
  disconnectBody:
    'Ischys will stop reading and writing Health Connect data. Any records already written stay in Health Connect.',
  unavailable: 'Health Connect is not available on this device.',
  writeAllowed: 'Allowed in Health Connect',
  writeDenied: 'Not allowed in Health Connect',
  writeDeniedExplainer:
    "Ischys isn't allowed to write exercise, so finished workouts aren't being saved to Health Connect. You can allow it there.",
  writeDeniedCta: 'Open Health Connect',
  readsNote:
    'These choose what Ischys asks for. What it may read is yours to allow in Health Connect.',
  readDenied: 'Not allowed in Health Connect',
  readDeniedExplainer:
    "Ischys isn't allowed to read this, so nothing can arrive. You can allow it in Health Connect.",
  checkCta: 'Open Health Connect',
  privacyNote:
    'Health data stays on this device. Ischys also reads your latest weight, for bodyweight exercises.',
  reads: {
    readHR: {
      label: 'Heart rate',
      offDesc: 'Average and max per session',
      explainer:
        'Reading is allowed, but Health Connect has had no heart rate for a workout yet. It needs a watch or band that syncs to Health Connect, worn during the session.',
    },
    readEnergy: {
      label: 'Active energy',
      offDesc: 'Calories burned per session',
      explainer:
        'Reading is allowed, but Health Connect has had no active calories for a workout yet. They need a watch or band that syncs to Health Connect, worn during the session.',
    },
    readBody: {
      label: 'Body fat',
      offDesc: 'Into your measurement history',
      explainer:
        'Reading is allowed, but Health Connect holds no body fat reading yet. It is the only body measurement Health Connect shares with your list — the rest are logged here and stay here. Nothing is written back.',
    },
  },
  useForBodyweight: 'Use Health Connect',
  noBodyweight: 'No bodyweight in Health Connect',
};

/** The Health wording for a platform; anything that is not Android reads as iOS. */
export function healthCopy(os: string): HealthCopy {
  return os === 'android' ? ANDROID : IOS;
}

/** A read row's state. `denied` only ever comes from a platform that says so. */
export type ReadRowKind = 'off' | 'receiving' | 'nothing' | 'denied';

/**
 * Resolves a read row from intent (is the switch on?), permission where the
 * platform reveals it (`allowed`; null on iOS, which never does), and reality
 * (did data arrive within thirty days?).
 *
 * A known refusal outranks an old receipt: data that arrived last week says
 * nothing about a read the user has since turned off.
 */
export function readRowKind(
  receipt: Receipt | null,
  enabled: boolean,
  allowed: boolean | null,
  now: number = Date.now(),
): ReadRowKind {
  if (!enabled) return 'off';
  if (allowed === false) return 'denied';
  if (!receipt) return 'nothing';
  const at = Date.parse(receipt.at);
  if (Number.isNaN(at) || now - at > THIRTY_DAYS_MS) return 'nothing';
  return 'receiving';
}

/** The permission flags as modules/health reports them on Android. */
type Grants = {
  writeWorkouts: boolean;
  readHeartRate: boolean;
  readEnergy: boolean;
  readBodyFat: boolean;
};

/**
 * Which read rows are allowed, or null per row when the platform will not say
 * (`grants` null: iOS, or Health Connect not answering).
 */
export function readsAllowed(grants: Grants | null): Record<ReadPref, boolean | null> {
  if (!grants) return { readHR: null, readEnergy: null, readBody: null };
  return {
    readHR: grants.readHeartRate,
    readEnergy: grants.readEnergy,
    readBody: grants.readBodyFat,
  };
}
