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
import { t } from '../i18n/t.ts';

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

function buildIos(): HealthCopy {
  return {
    name: 'Apple Health',
    connect: t('health.ios.connect'),
    settingsSub: t('health.ios.settingsSub'),
    device: t('health.ios.device'),
    intro: t('health.ios.intro'),
    next: t('health.ios.next'),
    disconnectBody: t('health.ios.disconnectBody'),
    unavailable: t('health.ios.unavailable'),
    writeAllowed: t('health.ios.writeAllowed'),
    writeDenied: t('health.ios.writeDenied'),
    writeDeniedExplainer: t('health.ios.writeDeniedExplainer'),
    writeDeniedCta: t('health.ios.writeDeniedCta'),
    readsNote: t('health.ios.readsNote'),
    readDenied: t('health.ios.readDenied'),
    readDeniedExplainer: t('health.ios.readDeniedExplainer'),
    checkCta: t('health.ios.checkCta'),
    privacyNote: t('health.ios.privacyNote'),
    reads: {
      readHR: {
        label: t('health.ios.readHR.label'),
        offDesc: t('health.ios.readHR.offDesc'),
        explainer: t('health.ios.readHR.explainer'),
      },
      readEnergy: {
        label: t('health.ios.readEnergy.label'),
        offDesc: t('health.ios.readEnergy.offDesc'),
        explainer: t('health.ios.readEnergy.explainer'),
      },
      readBody: {
        label: t('health.ios.readBody.label'),
        offDesc: t('health.ios.readBody.offDesc'),
        explainer: t('health.ios.readBody.explainer'),
      },
    },
    useForBodyweight: t('health.ios.useForBodyweight'),
    noBodyweight: t('health.ios.noBodyweight'),
  };
}

function buildAndroid(): HealthCopy {
  return {
    name: 'Health Connect',
    connect: t('health.android.connect'),
    settingsSub: t('health.android.settingsSub'),
    device: t('health.android.device'),
    intro: t('health.android.intro'),
    next: t('health.android.next'),
    disconnectBody: t('health.android.disconnectBody'),
    unavailable: t('health.android.unavailable'),
    writeAllowed: t('health.android.writeAllowed'),
    writeDenied: t('health.android.writeDenied'),
    writeDeniedExplainer: t('health.android.writeDeniedExplainer'),
    writeDeniedCta: t('health.android.writeDeniedCta'),
    readsNote: t('health.android.readsNote'),
    readDenied: t('health.android.readDenied'),
    readDeniedExplainer: t('health.android.readDeniedExplainer'),
    checkCta: t('health.android.checkCta'),
    privacyNote: t('health.android.privacyNote'),
    reads: {
      readHR: {
        label: t('health.android.readHR.label'),
        offDesc: t('health.android.readHR.offDesc'),
        explainer: t('health.android.readHR.explainer'),
      },
      readEnergy: {
        label: t('health.android.readEnergy.label'),
        offDesc: t('health.android.readEnergy.offDesc'),
        explainer: t('health.android.readEnergy.explainer'),
      },
      readBody: {
        label: t('health.android.readBody.label'),
        offDesc: t('health.android.readBody.offDesc'),
        explainer: t('health.android.readBody.explainer'),
      },
    },
    useForBodyweight: t('health.android.useForBodyweight'),
    noBodyweight: t('health.android.noBodyweight'),
  };
}

/** The Health wording for a platform; anything that is not Android reads as iOS. */
export function healthCopy(os: string): HealthCopy {
  return os === 'android' ? buildAndroid() : buildIos();
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
