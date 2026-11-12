/**
 * Settings screen — user preferences (units, timer, haptics), export/import, and
 * about links. Pushed onto the root Stack from Profile.
 * Source of truth: export/ischys-app/Settings.dc.html.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Appearance, EffortMode, SettingsOut, SettingsUpdate, Unit } from '../src/api/types';
import {
  countDuplicateGroups,
  getSettings,
  updateSettings,
} from '../src/api/workouts';
import { DraggableSheet } from '../src/components/DraggableSheet';
import { exportProfile, SharingUnavailable } from '../src/data/exportRepo';
import { Segment, type SegmentOption } from '../src/components/ui';
import { localizeNumber, toDisplay, toKg } from '../src/domain/units';
import { getBodyweightKg, setBodyweightKg } from '../src/lib/bodyweight';
import { readBodyweightFromHealth, syncBodyweightFromHealth } from '../src/lib/healthSync';
import { isOwnerActive, PROFILES_ENABLED, useActiveProfile } from '../src/lib/activeProfile';
import { exportFileStem, firstName, possessive, type ProfileRow } from '../src/domain/profiles';
import { openProfileSwitcher } from '../src/lib/profileSwitcherStore';
import { ProfileAvatar } from '../src/components/ProfileAvatar';
import { SectionLabel, type SectionScope } from '../src/components/SectionLabel';
import {
  getWeeklyTarget,
  setWeeklyTarget,
  MAX_WEEKLY_TARGET,
  MIN_WEEKLY_TARGET,
} from '../src/lib/weeklyTarget';
import { getCountWarmups, setCountWarmups } from '../src/lib/warmupVolume';
import { setHapticsEnabled } from '../src/lib/haptics';
import { maybeAskForExactAlarms } from '../src/lib/restAlert';
import {
  availability as healthAvailability,
  isAvailable as isHealthAvailable,
} from '../modules/health';
import { healthCopy } from '../src/lib/healthSyncPlatform';
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockRowIcon,
  CodeIcon,
  DownloadIcon,
  DumbbellIcon,
  EditIcon,
  HapticIcon,
  HeartFilledIcon,
  InfoIcon,
  PlusIcon,
  ShieldIcon,
  UnitsIcon,
  UploadIcon,
} from '../src/components/icons';
import { getDeloadState, setDeloadState } from '../src/lib/deloadState';
import { accentFor, PALETTES } from '../src/theme/palettes';
import { setEffortMode } from '../src/lib/effortMode';
import { setWeightUnit } from '../src/lib/weightUnit';
import { accentA, color, font, themed } from '../src/theme/tokens';
import { LIGHT_MODE_ENABLED, useTheme, useThemed } from '../src/theme/ThemeProvider';
import { APP_LANGS, getLang, NATIVE_LANG_NAME, t, type Lang, type LangPref } from '../src/i18n';
import { nameNeedsSystemFont } from '../src/i18n/scripts';
import { fontPlatform, systemFontFor } from '../src/theme/fontForLang';
import { profileNameLabel } from '../src/i18n/defaultLabels';
import { upperDisplay } from '../src/i18n/upper';

/**
 * The shipped version, read from the build rather than retyped — these strings
 * silently said 0.1.0 through the whole 0.2.0 release.
 *
 * `nativeAppVersion` is CFBundleShortVersionString straight from the bundle,
 * which is the number the App Store actually shows; `expoConfig` is the manifest
 * and can be null in a bare release build.
 */
const APP_VERSION = Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '';

const DEFAULT_SETTINGS: SettingsOut = {
  unit: 'kg',
  effort_mode: 'off',
  appearance: 'system',
  auto_start_rest_timer: true,
  keep_exercise_notes: false,
  rest_timer_alerts: true,
  haptic_feedback: true,
};

const DEVICE_SCOPE: SectionScope = { kind: 'device' };

const appearanceOptions = (): SegmentOption<Appearance>[] => [
  { label: t('settings.dark'), value: 'dark' },
  { label: t('settings.light'), value: 'light' },
  { label: t('settings.system'), value: 'system' },
];

const UNIT_OPTIONS: SegmentOption<Unit>[] = [
  { label: 'KG', value: 'kg' },
  { label: 'LB', value: 'lb' },
];

/** One control both turns effort ratings on and picks the scale (#84). */
const effortOptions = (): SegmentOption<EffortMode>[] => [
  { label: t('common.off'), value: 'off' },
  { label: 'RPE', value: 'rpe' },
  { label: 'RIR', value: 'rir' },
];

/** What the row says under the control, in the words of the scale chosen. */
const effortHelp = (mode: EffortMode): string =>
  t(mode === 'rir' ? 'settings.effortHelpRir' : 'settings.effortHelpRpe');

/** Merge glyph: two overlapping circles (icons.tsx is owned by another stream). */
function MergeIcon({ size = 19, color: strokeColor, strokeWidth = 2 }: { size?: number; color: string; strokeWidth?: number }) {
  useThemed();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={8} r={5} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={16} cy={16} r={5} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" />
    </Svg>
  );
}

/** A circle with its left half filled (7b). */
function AppearanceIcon({ color: c }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={2} fill="none" />
      <Path d="M12 3a9 9 0 000 18z" fill={c} />
    </Svg>
  );
}

/** Painter's palette (7b). */
function PaletteIcon({ color: c }: { color: string }) {
  const stroke = { stroke: c, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path
        d="M12 3a9 9 0 100 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.7-1.6H17a4 4 0 004-4c0-4.4-4-8.1-9-8.1z"
        {...stroke}
      />
      <Circle cx={7.5} cy={11} r={1} {...stroke} />
      <Circle cx={10.5} cy={7.5} r={1} {...stroke} />
      <Circle cx={15} cy={8} r={1} {...stroke} />
    </Svg>
  );
}

/** A globe: the Language row (#136). */
function GlobeIcon({ color: c }: { color: string }) {
  const stroke = { stroke: c, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke} />
      <Path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" {...stroke} />
    </Svg>
  );
}

/** Two opposed arrows, the Switch profile row (P3). */
function SwapIcon({ color: c }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path
        d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Watch outline, the non-owner Watch row (P9, P10). */
function WatchIcon({ color: c }: { color: string }) {
  const stroke = { stroke: c, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path d="M9 6h6a3 3 0 013 3v6a3 3 0 01-3 3H9a3 3 0 01-3-3V9a3 3 0 013-3z" {...stroke} />
      <Path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" {...stroke} />
    </Svg>
  );
}

/** Slim chevron-left glyph matching the design (viewBox 0 0 9 15). */
function BackChevronLeftIcon({ color: strokeColor }: { color: string }) {
  useThemed();
  return (
    <Svg width={9} height={15} viewBox="0 0 9 15">
      <Path
        d="M7 2L2 7.5 7 13"
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function Settings() {
  useThemed();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<SettingsOut>(DEFAULT_SETTINGS);
  const [dupCount, setDupCount] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bodyweight (kg): counts toward volume for bodyweight movements. Entered in the
  // user's unit; stored + used in kg. `bwOpen`/`bwInput` drive the entry sheet.
  const [bwKg, setBwKg] = useState<number | null>(null);
  const [bwOpen, setBwOpen] = useState(false);
  const [bwInput, setBwInput] = useState('');
  useEffect(() => {
    void (async () => {
      // With Health connected, take the weight from there rather than making the
      // user retype what Health already knows. No-op when it isn't connected.
      await syncBodyweightFromHealth();
      setBwKg(await getBodyweightKg());
    })();
  }, []);

  // Weekly workout goal — the denominator in Home's "2 / 4". Was hard-coded.
  const [weeklyTarget, setWeeklyTargetState] = useState(4);
  useEffect(() => {
    void getWeeklyTarget().then(setWeeklyTargetState);
  }, []);

  // Warmups-in-volume flag: SecureStore-backed (not a DB `patch()` toggle), loaded
  // once on mount. When on, warmup sets contribute to volume and the best_volume PR.
  const [countWarmups, setCountWarmupsState] = useState(false);
  const [deloadOn, setDeloadOn] = useState(true);
  const theme = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  useEffect(() => {
    void getCountWarmups().then(setCountWarmupsState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDeloadState().then((d) => setDeloadOn(d.enabled));
    getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
        setHapticsEnabled(s.haptic_feedback);
      })
      .catch(() => {
        // Stick with the sensible defaults.
      });
    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Refresh the duplicate count on focus — it changes after a merge lands.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      countDuplicateGroups()
        .then((n) => {
          if (!cancelled) setDupCount(n);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  /** Local optimistic update + fire-and-forget PATCH; failures are silently ignored. */
  const patch = (delta: SettingsUpdate) => {
    setSettings((s) => ({ ...s, ...delta }));
    if (delta.haptic_feedback !== undefined) setHapticsEnabled(delta.haptic_feedback);
    // Every screen showing a weight follows this at once — including a workout
    // left open underneath, which re-reads its sets in the new unit.
    if (delta.unit !== undefined) setWeightUnit(delta.unit);
    // Likewise the rating: an open workout shows or hides it straight away.
    if (delta.effort_mode !== undefined) setEffortMode(delta.effort_mode);
    updateSettings(delta).catch(() => {});
  };

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const doExport = async (fmt: 'json' | 'csv') => {
    try {
      await exportProfile(fmt);
    } catch (e) {
      showToast(e instanceof SharingUnavailable ? t('export.sharingUnavailable') : t('export.failed'));
    }
  };

  const onExport = () => {
    Alert.alert(t('export.title'), t('export.chooseFormat'), [
      { text: 'JSON', onPress: () => doExport('json') },
      { text: 'CSV', onPress: () => doExport('csv') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const onImport = () => {
    router.push('/import');
  };

  // Bodyweight entry (in the user's unit). Blank input clears it.
  const bwUnitLabel = settings.unit;
  const bwDisplay = bwKg != null ? toDisplay(bwKg, settings.unit) : null;
  const openBw = () => {
    setBwInput(bwDisplay != null ? String(bwDisplay) : '');
    setBwOpen(true);
  };
  const saveBw = async () => {
    const trimmed = bwInput.trim();
    if (trimmed === '') {
      await setBodyweightKg(null);
      setBwKg(null);
      setBwOpen(false);
      return;
    }
    const n = parseFloat(trimmed.replace(',', '.'));
    if (!Number.isFinite(n)) {
      setBwOpen(false);
      return;
    }
    const kg = toKg(n, settings.unit);
    await setBodyweightKg(kg);
    setBwKg(await getBodyweightKg()); // re-read: rejects out-of-range, so UI mirrors what's stored
    setBwOpen(false);
  };
  const pullBwFromHealth = async () => {
    // Asks for the weight read first when it may be missing (healthSync).
    const kg = await readBodyweightFromHealth();
    if (kg == null) {
      showToast(healthCopy(Platform.OS).noBodyweight);
      return;
    }
    const disp = toDisplay(kg, settings.unit);
    setBwInput(disp != null ? String(Math.round(disp * 10) / 10) : '');
  };

  // Profiles (#117). Off: today's Settings. One profile: the PROFILE section
  // (P1b) on top of today's. Two or more: the P9 order, every section labelled
  // with whose setting it is.
  const { profile, count } = useActiveProfile();
  const layout: 'off' | 'single' | 'multi' = !PROFILES_ENABLED ? 'off' : count >= 2 ? 'multi' : 'single';
  const multi = layout === 'multi';
  const first = firstName(profileNameLabel(profile.name)) || profileNameLabel(profile.name);
  const profileScope: SectionScope = { kind: 'profile', profile };
  const healthShown = Platform.OS === 'ios' || healthAvailability() !== 'unavailable';

  // The rows, built once and placed by the layout. `last` drops the divider.
  const unitsRow = (
    <SegmentRow
      icon={<UnitsIcon size={20} color={color.text2} />}
      label={t('settings.units')}
      options={UNIT_OPTIONS}
      value={settings.unit}
      onChange={(v) => patch({ unit: v })}
      isLast={false}
    />
  );
  const effortRow = <EffortRow value={settings.effort_mode} onChange={(v) => patch({ effort_mode: v })} />;
  const autoRestRow = (last: boolean) => (
    <ToggleRow
      icon={<ClockRowIcon size={20} color={color.text2} strokeWidth={2} />}
      label={t('settings.autoRest')}
      value={settings.auto_start_rest_timer}
      onChange={(v) => patch({ auto_start_rest_timer: v })}
      isLast={last}
    />
  );
  const keepNotesRow = (last: boolean) => (
    <ToggleRow
      icon={<EditIcon size={20} color={color.text2} />}
      label={t('settings.keepNotes')}
      sub={t('settings.keepNotes.sub')}
      value={settings.keep_exercise_notes}
      onChange={(v) => patch({ keep_exercise_notes: v })}
      isLast={last}
    />
  );
  const restAlertsRow = (last: boolean) => (
    <ToggleRow
      icon={<BellIcon size={20} color={color.text2} />}
      label={t('settings.restAlerts')}
      value={settings.rest_timer_alerts}
      onChange={(v) => {
        patch({ rest_timer_alerts: v });
        if (v) void maybeAskForExactAlarms(true, { force: true });
      }}
      isLast={last}
    />
  );
  const hapticsRow = (last: boolean) => (
    <ToggleRow
      icon={<HapticIcon size={20} color={color.text2} />}
      label={t('settings.haptics')}
      value={settings.haptic_feedback}
      onChange={(v) => patch({ haptic_feedback: v })}
      isLast={last}
    />
  );
  const warmupsRow = (last: boolean) => (
    <ToggleRow
      icon={<WarmupIcon size={20} color={color.text2} />}
      label={t('settings.warmups')}
      value={countWarmups}
      onChange={(v) => {
        setCountWarmupsState(v);
        void setCountWarmups(v);
      }}
      isLast={last}
    />
  );
  const deloadRow = (last: boolean) => (
    <ToggleRow
      icon={<WarmupIcon size={20} color={color.text2} />}
      label={t('settings.deload')}
      value={deloadOn}
      onChange={(v) => {
        setDeloadOn(v);
        void getDeloadState().then((d) => setDeloadState({ ...d, enabled: v }));
      }}
      isLast={last}
    />
  );
  const platesRow = (last: boolean) => (
    <LinkRow
      icon={<DumbbellIcon size={19} color={color.text2} />}
      label={t('plates.title')}
      sub={t('settings.platesSub')}
      onPress={() => router.push('/plates')}
      isLast={last}
    />
  );
  const targetRow = (last: boolean) => (
    <TargetRow
      value={weeklyTarget}
      onChange={(n) => {
        setWeeklyTargetState(n);
        void setWeeklyTarget(n);
      }}
      isLast={last}
    />
  );
  const bodyweightRow = (last: boolean) => (
    <LinkRow
      icon={<BodyweightIcon size={20} color={color.text2} />}
      label={t('settings.bodyweight')}
      sub={t('settings.bodyweightSub')}
      value={bwDisplay != null ? `${localizeNumber(String(bwDisplay))} ${bwUnitLabel}` : t('settings.notSet')}
      onPress={openBw}
      isLast={last}
    />
  );
  const languageFollowing = t('settings.languageFollowing', {
    device: Platform.OS === 'ios' ? t('settings.deviceIos') : t('settings.devicePhone'),
    language: NATIVE_LANG_NAME[theme.systemLanguage],
  });
  const appearanceRows = (
    <>
      {LIGHT_MODE_ENABLED && (
        <SegmentRow
          icon={<AppearanceIcon color={color.text2} />}
          label={t('settings.appearance')}
          sub={
            theme.appearance === 'system'
              ? t('settings.following', {
                  device: Platform.OS === 'ios' ? t('settings.deviceIos') : t('settings.devicePhone'),
                  scheme: theme.systemScheme === 'dark' ? t('settings.dark') : t('settings.light'),
                })
              : undefined
          }
          options={appearanceOptions()}
          value={theme.appearance}
          onChange={theme.setAppearance}
          padX={9}
          isLast={false}
        />
      )}
      <LinkRow
        icon={<PaletteIcon color={color.text2} />}
        label={t('settings.theme')}
        value={theme.palette.name}
        onPress={() => setThemeOpen((o) => !o)}
        isLast={false}
      />
      {themeOpen && (
        <View style={[styles.themeRow, styles.rowDivider]}>
          {PALETTES.map((p) => {
            const on = p.id === theme.palette.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => theme.setTheme(p.id)}
                style={[styles.themeSwatchWrap, on && styles.themeSwatchOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={p.name}
              >
                {/* The swatch for the appearance showing now. */}
                <View
                  style={[styles.themeSwatch, { backgroundColor: accentFor(p, theme.scheme).accent }]}
                />
                <Text style={[styles.themeName, on && styles.themeNameOn]}>{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {/* Language (#136): opens in place like Theme. A phone setting, so it
          sits with Appearance; it applies at once, no restart. */}
      <LinkRow
        icon={<GlobeIcon color={color.text2} />}
        label={t('settings.language')}
        sub={theme.language === 'system' ? languageFollowing : undefined}
        value={theme.language === 'system' ? t('settings.system') : NATIVE_LANG_NAME[theme.language]}
        onPress={() => setLangOpen((o) => !o)}
        isLast={!langOpen}
      />
      {langOpen && (
        <LanguageOptions value={theme.language} following={languageFollowing} onPick={theme.setLanguage} />
      )}
    </>
  );
  const languageFooter = langOpen
    ? t(Platform.OS === 'ios' ? 'settings.languageFooterIos' : 'settings.languageFooterAndroid')
    : undefined;
  const healthRow = (
    <LinkRow
      icon={<HeartFilledIcon size={20} color={color.text2} />}
      label={healthCopy(Platform.OS).name}
      sub={healthCopy(Platform.OS).settingsSub}
      onPress={() => router.push('/health')}
      isLast
    />
  );

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 116 + insets.top },
        ]}
      >
        {layout !== 'off' && (
          <Section
            title={t('settings.sectionProfile')}
            footer={multi ? undefined : t('settings.profileFooter')}
          >
            <PersonRow
              profile={profile}
              sub={multi ? t('settings.profilesOnPhone', { count }) : t('settings.justYou')}
              onPress={() => router.push('/profiles')}
            />
            {multi ? (
              <LinkRow
                icon={<SwapIcon color={color.text2} />}
                label={t('switcher.title')}
                onPress={openProfileSwitcher}
                isLast
              />
            ) : (
              <RowShell
                icon={<PlusIcon size={19} color={color.text2} strokeWidth={2.2} />}
                label={t('profiles.add')}
                onPress={() => router.push('/profiles/new')}
                isLast
              />
            )}
          </Section>
        )}

        {multi ? (
          <>
            {/* P9: the profile's own sections first, named; then THIS PHONE. */}
            <Section title={t('settings.sectionTraining')} scope={profileScope} footer={t('settings.effortFooter')}>
              {unitsRow}
              {effortRow}
              {targetRow(false)}
              {bodyweightRow(false)}
              {platesRow(false)}
              {autoRestRow(false)}
              {keepNotesRow(false)}
              {warmupsRow(false)}
              {deloadRow(true)}
            </Section>

            <Section title={t('settings.sectionData')} scope={profileScope}>
              <LinkRow
                icon={<UploadIcon size={20} color={color.text2} />}
                label={t('settings.exportWhose', { whose: possessive(profileNameLabel(profile.name)) })}
                value={t('profiles.exportFormats')}
                sub={upperDisplay(exportFileStem(count, profile.name, new Date()))}
                onPress={onExport}
                isLast={false}
              />
              <LinkRow
                icon={<DownloadIcon size={20} color={color.text2} />}
                label={t('settings.importInto', { name: first })}
                onPress={onImport}
                isLast={false}
              />
              <MergeRow
                count={dupCount}
                sub={t('settings.inHistory', { whose: upperDisplay(possessive(profileNameLabel(profile.name))) })}
                onPress={() => router.push('/merge-duplicates')}
              />
            </Section>

            <Section
              title={t('settings.sectionAppearance')}
              scope={DEVICE_SCOPE}
              footer={languageFooter ? joinSentences(languageFooter, t('settings.phoneFooter')) : t('settings.phoneFooter')}
            >
              {appearanceRows}
            </Section>

            <Section title={t('settings.sectionAlerts')} scope={DEVICE_SCOPE}>
              {restAlertsRow(false)}
              {hapticsRow(true)}
            </Section>

            {healthShown && (
              <Section title={t('profiles.healthWatch')} scope={DEVICE_SCOPE}>
                {profile.isOwner ? (
                  healthRow
                ) : (
                  <>
                    {/* Health and the Watch are the owner's only (#117, P10). */}
                    <LinkRow
                      icon={<HeartFilledIcon size={20} color={color.text2} />}
                      label={healthCopy(Platform.OS).name}
                      value={t('health.offFor', { name: first })}
                      onPress={() => router.push('/health')}
                      isLast={false}
                    />
                    <LinkRow
                      icon={<WatchIcon color={color.text2} />}
                      label={Platform.OS === 'ios' ? 'Apple Watch' : 'Watch'}
                      value={t('health.offFor', { name: first })}
                      onPress={() => router.push('/health')}
                      isLast
                    />
                  </>
                )}
              </Section>
            )}
          </>
        ) : (
          <>
            {/* TRAINING */}
            <Section title={t('settings.sectionTraining')} footer={t('settings.effortFooter')}>
              {unitsRow}
              {effortRow}
              {autoRestRow(false)}
              {keepNotesRow(false)}
              {restAlertsRow(false)}
              {hapticsRow(false)}
              {warmupsRow(false)}
              {deloadRow(false)}
              {platesRow(false)}
              {targetRow(false)}
              {bodyweightRow(true)}
            </Section>

            {/* APPEARANCE (7b). Two independent settings: the appearance swaps
                surfaces, text and status colours; the theme swaps only the accent,
                which marks one action per screen. Both apply at once. */}
            <Section title={t('settings.sectionAppearance')} footer={languageFooter}>
              {appearanceRows}
            </Section>

            {/* Health is the only thing in this section: Apple Health on iOS, and
                Health Connect on an Android that has it or can install it. */}
            {healthShown && <Section title={t('settings.sectionDevice')}>{healthRow}</Section>}

            <Section title={t('settings.sectionData')}>
              <LinkRow
                icon={<UploadIcon size={20} color={color.text2} />}
                label={t('export.title')}
                value="CSV / JSON"
                onPress={onExport}
                isLast={false}
              />
              <LinkRow
                icon={<DownloadIcon size={20} color={color.text2} />}
                label={t('settings.importWorkout')}
                value="CSV / JSON"
                onPress={onImport}
                isLast={false}
              />
              <MergeRow count={dupCount} onPress={() => router.push('/merge-duplicates')} />
            </Section>
          </>
        )}

        {/* ABOUT */}
        <Section title={t('settings.sectionAbout')}>
          <LinkRow
            icon={<ShieldIcon size={20} color={color.text2} />}
            label={t('settings.privacy')}
            value={t('settings.onDevice')}
            onPress={() => {
              const backup = Platform.OS === 'ios' ? t('settings.backupIos') : t('settings.backupAndroid');
              Alert.alert(
                t('settings.privacy'),
                t('settings.privacyBody', { backup }),
                [
                  {
                    text: t('settings.privacyPolicy'),
                    onPress: () => {
                      Linking.openURL('https://ischys.app/privacy').catch(() => {});
                    },
                  },
                  { text: t('common.ok'), style: 'cancel' },
                ],
              );
            }}
            isLast={false}
          />
          <LinkRow
            icon={<CodeIcon size={20} color={color.text2} />}
            label={t('settings.sourceCode')}
            value="GitHub"
            onPress={() => {
              Linking.openURL('https://github.com/ischys-app/Ischys').catch(() => {});
            }}
            isLast={false}
          />
          <LinkRow
            icon={<InfoIcon size={20} color={color.text2} />}
            label={t('settings.aboutRow')}
            value={APP_VERSION ? `v${APP_VERSION}` : undefined}
            onPress={() => {
              Alert.alert(
                'Ischys · ΙΣΧΥΣ',
                t('settings.aboutBody', { version: String(APP_VERSION) }),
              );
            }}
            isLast
          />
        </Section>

        <Text style={styles.footer}>{`Ischys · ΙΣΧΥΣ · v${APP_VERSION}`}</Text>
      </ScrollView>

      {/* Header (absolute, blurred solid) */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
          accessibilityLabel={t('common.back')}
          accessibilityRole="button"
        >
          <BackChevronLeftIcon color={color.text2} />
        </Pressable>
        <Text style={styles.title}>{t('settings.title')}</Text>
      </View>

      {toast && (
        <View
          style={[
            styles.toast,
            { bottom: 24 + insets.bottom },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <DraggableSheet
        visible={bwOpen}
        onClose={() => setBwOpen(false)}
        sheetStyle={[styles.bwSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View style={styles.bwGrabberWrap}>
          <View style={styles.bwGrabber} />
        </View>
        <View style={styles.bwBody}>
          <Text style={styles.bwTitle}>{t('settings.bodyweight')}</Text>
          <Text style={styles.bwText}>
            {t('settings.bodyweightText')}
          </Text>
          <View style={styles.bwInputRow}>
            <TextInput
              style={styles.bwInput}
              value={bwInput}
              onChangeText={setBwInput}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={color.text3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveBw}
              accessibilityLabel={t('settings.bodyweightField')}
            />
            <Text style={styles.bwUnit}>{bwUnitLabel}</Text>
          </View>
          {/* Health is the phone owner's only (#117). */}
          {isHealthAvailable() && isOwnerActive() && (
            <Pressable
              onPress={pullBwFromHealth}
              style={({ pressed }) => [styles.bwHealth, pressed && styles.bwHealthPressed]}
              accessibilityRole="button"
            >
              <HeartFilledIcon size={14} color={color.drop} />
              <Text style={styles.bwHealthText}>{healthCopy(Platform.OS).useForBodyweight}</Text>
            </Pressable>
          )}
          <Pressable
            onPress={saveBw}
            style={({ pressed }) => [styles.bwSave, pressed && styles.bwSavePressed]}
            accessibilityRole="button"
          >
            <Text style={styles.bwSaveText}>{t('common.save')}</Text>
          </Pressable>
        </View>
      </DraggableSheet>
    </View>
  );
}

/** Flame glyph for the Count-warmups-in-volume row. */
function WarmupIcon({ size = 20, color: c }: { size?: number; color: string }) {
  useThemed();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3c1 3-1.5 4.5-1.5 7A3.5 3.5 0 0 0 14 13c.3-.7.3-1.5 0-2 2 1 3.5 3 3.5 5.5a5.5 5.5 0 1 1-11 0C6.5 8.5 12 8 12 3Z"
        stroke={c}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Weekly-goal row: − value + . A stepper rather than a segmented control
 * because the sensible range (1–14) is far too wide to lay out as options.
 */
function TargetRow({
  value,
  onChange,
  isLast,
}: {
  value: number;
  onChange: (n: number) => void;
  isLast: boolean;
}) {
  useThemed();
  const step = (delta: number) => {
    const next = Math.min(MAX_WEEKLY_TARGET, Math.max(MIN_WEEKLY_TARGET, value + delta));
    if (next !== value) onChange(next);
  };
  const atMin = value <= MIN_WEEKLY_TARGET;
  const atMax = value >= MAX_WEEKLY_TARGET;
  return (
    <RowShell
      icon={<TargetIcon size={20} color={color.text2} />}
      label={t('settings.weeklyGoal')}
      sub={t('settings.weeklyGoalSub')}
      isLast={isLast}
      right={
        <View style={styles.stepper}>
          <Pressable
            onPress={() => step(-1)}
            disabled={atMin}
            hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.goalDown')}
          >
            <Text style={[styles.stepGlyph, atMin && styles.stepGlyphOff]}>−</Text>
          </Pressable>
          <Text style={styles.stepValue}>{value}</Text>
          <Pressable
            onPress={() => step(1)}
            disabled={atMax}
            hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel={t('settings.goalUp')}
          >
            <Text style={[styles.stepGlyph, atMax && styles.stepGlyphOff]}>+</Text>
          </Pressable>
        </View>
      }
    />
  );
}

/** Concentric-rings target glyph for the Weekly goal row. */
function TargetIcon({ size = 20, color: c }: { size?: number; color: string }) {
  useThemed();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={4.5} stroke={c} strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={1.2} fill={c} />
    </Svg>
  );
}

/** Bathroom-scale glyph for the Bodyweight row. */
function BodyweightIcon({ size = 20, color: c }: { size?: number; color: string }) {
  useThemed();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
        stroke={c}
        strokeWidth={1.8}
      />
      <Path d="M12 8v2.5M9.5 8.5l2 2M14.5 8.5l-2 2" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={12} cy={11.5} r={1.2} fill={c} />
    </Svg>
  );
}

// --- Section + Rows -------------------------------------------------------

function Section({
  title,
  footer,
  scope,
  children,
}: {
  title: string;
  /** A note under the card, for a consequence that belongs to no single row. */
  footer?: string;
  /** Whose setting this is, with 2+ profiles (P9). Absent: today's plain label. */
  scope?: SectionScope;
  children: React.ReactNode;
}) {
  useThemed();
  return (
    <View style={styles.section}>
      {scope ? (
        <SectionLabel scope={scope} style={styles.sectionTitleBox}>
          {title}
        </SectionLabel>
      ) : (
        <Text style={styles.sectionTitle}>{upperDisplay(title)}</Text>
      )}
      <View style={styles.card}>{children}</View>
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/**
 * "Effort per set": Off | RPE | RIR, with what the scale means underneath
 * (board 14a, F1). Its own control rather than the shared `Segment`, because
 * the board draws this one bordered and 30pt tall. The selected segment is a
 * surface, not the accent — the same reasoning as the scale it switches on.
 */
function EffortRow({
  value,
  onChange,
}: {
  value: EffortMode;
  onChange: (next: EffortMode) => void;
}) {
  useThemed();
  return (
    <View style={[styles.effortRow, styles.rowDivider]}>
      <View style={styles.effortTop}>
        <View style={styles.rowIcon}>
          <WarmupIcon size={20} color={color.text2} />
        </View>
        <Text style={[styles.rowLabel, styles.effortLabel]} numberOfLines={1}>
          {t('settings.effort')}
        </Text>
        <View style={styles.effortSegment} accessibilityRole="radiogroup">
          {effortOptions().map((opt) => {
            const selected = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => onChange(opt.value)}
                // 30pt as drawn; the slop brings the target to 44.
                hitSlop={{ top: 7, bottom: 7 }}
                style={[styles.effortOption, selected && styles.effortOptionOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t('settings.effortOption', { option: opt.label })}
              >
                <Text style={[styles.effortOptionText, selected && styles.effortOptionTextOn]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.effortHelp}>{effortHelp(value)}</Text>
    </View>
  );
}

function RowShell({
  icon,
  label,
  sub,
  danger,
  isLast,
  right,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  danger?: boolean;
  isLast: boolean;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  useThemed();
  const content = (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowLabelCol}>
        <Text
          style={[
            styles.rowLabel,
            danger && { color: color.error },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

function ToggleRow({
  icon,
  label,
  sub,
  value,
  onChange,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  isLast: boolean;
}) {
  useThemed();
  return (
    <RowShell
      icon={icon}
      label={label}
      sub={sub}
      isLast={isLast}
      onPress={() => onChange(!value)}
      right={
        <View
          style={[
            styles.toggleTrack,
            { backgroundColor: value ? color.accent : color.surface3 },
          ]}
        >
          <View
            style={[
              styles.toggleKnob,
              { left: value ? 21 : 3 },
            ]}
          />
        </View>
      }
    />
  );
}

function SegmentRow<T extends string>({
  icon,
  label,
  sub,
  options,
  value,
  onChange,
  padX,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  padX?: number;
  isLast: boolean;
}) {
  useThemed();
  return (
    <RowShell
      icon={icon}
      label={label}
      sub={sub}
      isLast={isLast}
      right={<Segment options={options} value={value} onChange={onChange} padX={padX} />}
    />
  );
}

/**
 * The Language list (#136): System, then each language named in itself, so a
 * reader stuck in a language they can't read can still find theirs. A name in
 * a script Space Grotesk lacks draws in the system font, never a mix.
 */
function LanguageOptions({
  value,
  following,
  onPick,
}: {
  value: LangPref;
  following: string;
  onPick: (next: LangPref) => void;
}) {
  useThemed();
  const ids: LangPref[] = ['system', ...APP_LANGS];
  return (
    <View style={styles.langList} accessibilityRole="radiogroup" accessibilityLabel={t('settings.language')}>
      {ids.map((id, i) => {
        const on = id === value;
        const name = id === 'system' ? t('settings.system') : NATIVE_LANG_NAME[id];
        const ownFont = id !== 'system' && needsSystemFont(id) ? systemFontFor(on ? 'SpaceGrotesk_600SemiBold' : 'SpaceGrotesk_500Medium', fontPlatform()) : null;
        return (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            style={({ pressed }) => [styles.langRow, i < ids.length - 1 && styles.rowDivider, pressed && styles.rowPressed]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            accessibilityLabel={id === 'system' ? `${name}, ${following}` : name}
            accessibilityLanguage={id === 'system' ? undefined : id}
          >
            <View style={styles.rowLabelCol}>
              <Text
                style={[styles.langName, on && styles.langNameOn, ownFont]}
                numberOfLines={1}
                accessibilityLanguage={id === 'system' ? undefined : id}
              >
                {name}
              </Text>
              {id === 'system' && <Text style={styles.rowSub}>{following}</Text>}
            </View>
            {on && <CheckIcon size={17} color={color.accent} strokeWidth={3} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Two sentences in one footer: Chinese runs them together, others take a space. */
function joinSentences(a: string, b: string): string {
  return getLang() === 'zh-Hans' ? `${a}${b}` : `${a} ${b}`;
}

/** Space Grotesk has Latin only: Greek, Cyrillic and CJK names take the system font. */
function needsSystemFont(id: Lang): boolean {
  return nameNeedsSystemFont(id, getLang());
}

function LinkRow({
  icon,
  label,
  value,
  sub,
  onPress,
  isLast,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  /** Optional trailing value; rows like Health show only a chevron. */
  value?: string;
  sub?: string;
  onPress: () => void;
  isLast: boolean;
  danger?: boolean;
}) {
  useThemed();
  return (
    <RowShell
      icon={icon}
      label={label}
      sub={sub}
      danger={danger}
      isLast={isLast}
      onPress={onPress}
      right={
        <View style={styles.linkRight}>
          {!!value && <Text style={styles.linkValue}>{value}</Text>}
          <ChevronRightIcon size={15} color={color.text3} strokeWidth={2.2} />
        </View>
      }
    />
  );
}

/**
 * The PROFILE section's first row (P1b, P9): the current profile's 40pt
 * avatar, initials in the accent as on the Profile tab, its name and a mono
 * sub line. Opens Manage profiles.
 */
function PersonRow({ profile, sub, onPress }: { profile: ProfileRow; sub: string; onPress: () => void }) {
  useThemed();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={t('settings.managePerson', { name: profileNameLabel(profile.name) })}
    >
      <View style={[styles.row, styles.personRow, styles.rowDivider]}>
        <ProfileAvatar profile={profile} size={40} tint={color.accent} />
        <View style={styles.rowLabelCol}>
          <Text style={styles.personName} numberOfLines={1}>
            {profileNameLabel(profile.name)}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <ChevronRightIcon size={15} color={color.text3} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

/**
 * Merge-duplicates row (board M1): sub-labelled, with an accent count pill that
 * appears only when duplicates were detected, plus a chevron. Last in DATA.
 */
function MergeRow({ count, sub, onPress }: { count: number; sub?: string; onPress: () => void }) {
  useThemed();
  return (
    <RowShell
      icon={<MergeIcon size={19} color={color.text2} />}
      label={t('mergeDup.title')}
      sub={sub ?? t('settings.mergeSub')}
      isLast
      onPress={onPress}
      right={
        <View style={styles.linkRight}>
          {count > 0 && (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{count}</Text>
            </View>
          )}
          <ChevronRightIcon size={15} color={color.text3} strokeWidth={2.2} />
        </View>
      }
    />
  );
}

// --- Styles ---------------------------------------------------------------

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg },

    // Header
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      backgroundColor: color.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: color.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnPressed: { opacity: 0.7 },
    title: {
      fontFamily: font.titleSemi,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: -0.17,
      color: color.text1,
    },

    // Scroll
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },

    // Section
    section: { marginBottom: 24 },
    sectionTitle: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 1.54,
      color: color.text3,
      paddingLeft: 2,
      paddingRight: 2,
      paddingBottom: 10,
    },
    sectionTitleBox: { paddingLeft: 2, paddingRight: 2, paddingBottom: 10 },
    card: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 16,
      overflow: 'hidden',
    },
    sectionFooter: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text3,
      marginTop: 12,
      paddingHorizontal: 4,
    },

    // Effort per set (board 14a, F1)
    effortRow: { paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 16 },
    // 13 is `row`'s gap, so this label starts where every other one does.
    effortTop: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    effortLabel: { flex: 1, minWidth: 0 },
    effortSegment: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: 9,
      backgroundColor: color.surface2,
      borderWidth: 1,
      borderColor: color.border,
      flexShrink: 0,
    },
    effortOption: {
      height: 30,
      paddingHorizontal: 12,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    effortOptionOn: { backgroundColor: color.surface3 },
    effortOptionText: {
      fontFamily: font.monoMedium,
      fontSize: 12.5,
      color: color.text3,
    },
    effortOptionTextOn: { fontFamily: font.monoSemi, color: color.text1 },
    effortHelp: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text2,
      marginTop: 10,
    },

    // Row
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 15,
      paddingHorizontal: 16,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
    },
    rowPressed: { opacity: 0.85 },
    rowIcon: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    rowLabelCol: { flex: 1, minWidth: 0 },
    rowLabel: {
      fontFamily: font.bodyMedium,
      fontSize: 14.5,
      fontWeight: '500',
      color: color.text1,
    },
    personRow: { paddingVertical: 12 },
    personName: {
      fontFamily: font.titleSemi,
      fontSize: 16,
      fontWeight: '600',
      color: color.text1,
    },
    rowSub: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      color: color.text3,
      marginTop: 2,
    },

    // Toggle
    toggleTrack: {
      width: 44,
      height: 26,
      borderRadius: 999,
      position: 'relative',
      flexShrink: 0,
    },
    toggleKnob: {
      position: 'absolute',
      top: 3,
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
    },

    // Segment
    // Link right
    themeRow: { flexDirection: 'row', gap: 8, padding: 12 },
    langList: { paddingLeft: 49 },
    langRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingRight: 16 },
    langName: { fontFamily: font.bodyMedium, fontSize: 14.5, fontWeight: '500', color: color.text2 },
    langNameOn: { fontFamily: font.titleSemi, fontWeight: '600', color: color.text1 },
    themeSwatchWrap: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    // Selection is a surface and an edge, not the accent — the swatch already
    // carries the colour, and outlining it in itself would say nothing.
    themeSwatchOn: { backgroundColor: color.surface2, borderColor: color.border },
    themeSwatch: { width: 26, height: 26, borderRadius: 13 },
    themeName: { fontFamily: font.monoMedium, fontSize: 11, color: color.text3 },
    themeNameOn: { color: color.text1 },
    linkRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    linkValue: {
      fontFamily: font.monoRegular,
      fontSize: 12.5,
      color: color.text3,
      fontVariant: ['tabular-nums'],
    },

    // Weekly-goal stepper
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      backgroundColor: color.surface2,
      borderWidth: 1,
      borderColor: color.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnPressed: { borderColor: color.text3 },
    stepGlyph: { fontFamily: font.titleSemi, fontSize: 16, lineHeight: 19, color: color.text1 },
    stepGlyphOff: { color: color.text3 },
    stepValue: {
      minWidth: 26,
      textAlign: 'center',
      fontFamily: font.monoSemi,
      fontSize: 15,
      color: color.text1,
      fontVariant: ['tabular-nums'],
    },

    // Bodyweight entry sheet
    bwSheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderTopColor: color.border,
    },
    bwGrabberWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
    bwGrabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
    bwBody: { paddingHorizontal: 20, paddingTop: 10 },
    bwTitle: { fontFamily: font.titleSemi, fontSize: 19, letterSpacing: -0.19, color: color.text1 },
    bwText: {
      fontFamily: font.bodyRegular,
      fontSize: 13.5,
      lineHeight: 20,
      color: color.text2,
      marginTop: 8,
      marginBottom: 18,
    },
    bwInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: color.surface2,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 14,
      paddingHorizontal: 16,
      height: 56,
    },
    bwInput: {
      flex: 1,
      fontFamily: font.monoSemi,
      fontSize: 26,
      color: color.text1,
      fontVariant: ['tabular-nums'],
      padding: 0,
    },
    bwUnit: { fontFamily: font.monoMedium, fontSize: 14, color: color.text3 },
    bwHealth: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      height: 44,
      borderRadius: 12,
      marginTop: 10,
    },
    bwHealthPressed: { opacity: 0.6 },
    bwHealthText: { fontFamily: font.titleSemi, fontSize: 14, color: color.drop },
    bwSave: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    bwSavePressed: { opacity: 0.9 },
    bwSaveText: { fontFamily: font.displayBold, fontSize: 15, letterSpacing: -0.15, color: color.accentFg },

    // Accent count pill (Merge duplicates row)
    countPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: accentA(0.12),
      borderWidth: 1,
      borderColor: accentA(0.3),
    },
    countPillText: {
      fontFamily: font.monoSemi,
      fontSize: 11.5,
      color: color.accent,
      fontVariant: ['tabular-nums'],
    },

    // Footer
    footer: {
      textAlign: 'center',
      fontFamily: font.monoRegular,
      fontSize: 11,
      color: color.text3,
      marginTop: 8,
      paddingTop: 8,
      paddingBottom: 4,
    },

    // Toast
    toast: {
      position: 'absolute',
      left: 24,
      right: 24,
      alignItems: 'center',
    },
    toastText: {
      fontFamily: font.monoMedium,
      fontSize: 12,
      color: color.text1,
      backgroundColor: color.surface2,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      overflow: 'hidden',
    },
  }),
);
