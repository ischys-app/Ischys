/**
 * Settings screen — user preferences (units, timer, haptics), export/import, and
 * about links. Pushed onto the root Stack from Profile.
 * Source of truth: export/ischys-app/Settings.dc.html.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cacheDirectory, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EffortMode, SettingsOut, SettingsUpdate, Unit } from '../src/api/types';
import {
  countDuplicateGroups,
  exportData,
  getSettings,
  updateSettings,
} from '../src/api/workouts';
import { DraggableSheet } from '../src/components/DraggableSheet';
import { Segment, type SegmentOption } from '../src/components/ui';
import { toDisplay, toKg } from '../src/domain/units';
import { getBodyweightKg, setBodyweightKg } from '../src/lib/bodyweight';
import { syncBodyweightFromHealth } from '../src/lib/healthSync';
import {
  getWeeklyTarget,
  setWeeklyTarget,
  MAX_WEEKLY_TARGET,
  MIN_WEEKLY_TARGET,
} from '../src/lib/weeklyTarget';
import { getCountWarmups, setCountWarmups } from '../src/lib/warmupVolume';
import { setHapticsEnabled } from '../src/lib/haptics';
import { maybeAskForExactAlarms } from '../src/lib/restAlert';
import { isAvailable as isHealthAvailable, readBodyMass, requestAuthorization as requestHealthAuth } from '../modules/health';
import {
  BellIcon,
  ChevronRightIcon,
  ClockRowIcon,
  CodeIcon,
  DownloadIcon,
  DumbbellIcon,
  HapticIcon,
  HeartFilledIcon,
  InfoIcon,
  ShieldIcon,
  UnitsIcon,
  UploadIcon,
} from '../src/components/icons';
import { getDeloadState, setDeloadState } from '../src/lib/deloadState';
import { PALETTES, type ThemeId } from '../src/theme/palettes';
import { getThemeId, setThemeId } from '../src/lib/themePref';
import { setEffortMode } from '../src/lib/effortMode';
import { setWeightUnit } from '../src/lib/weightUnit';
import { accentA, color, font } from '../src/theme/tokens';

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
  auto_start_rest_timer: true,
  rest_timer_alerts: true,
  haptic_feedback: true,
};

const UNIT_OPTIONS: SegmentOption<Unit>[] = [
  { label: 'KG', value: 'kg' },
  { label: 'LB', value: 'lb' },
];

/** One control both turns effort ratings on and picks the scale (#84). */
const EFFORT_OPTIONS: SegmentOption<EffortMode>[] = [
  { label: 'Off', value: 'off' },
  { label: 'RPE', value: 'rpe' },
  { label: 'RIR', value: 'rir' },
];

/** What the row says under the control, in the words of the scale chosen. */
const EFFORT_HELP: Record<EffortMode, string> = {
  off: 'Rate a set while you rest. RPE runs 6 to 10, where 10 means nothing left and 8 means two reps left.',
  rpe: 'Rate a set while you rest. RPE runs 6 to 10, where 10 means nothing left and 8 means two reps left.',
  rir: 'Rate a set while you rest. RIR counts the reps you had left, where 0 means nothing left.',
};

/** Merge glyph: two overlapping circles (icons.tsx is owned by another stream). */
function MergeIcon({ size = 19, color: strokeColor, strokeWidth = 2 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={8} r={5} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={16} cy={16} r={5} stroke={strokeColor} strokeWidth={strokeWidth} fill="none" />
    </Svg>
  );
}

/** Slim chevron-left glyph matching the design (viewBox 0 0 9 15). */
function BackChevronLeftIcon({ color: strokeColor }: { color: string }) {
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
  const [theme, setThemeState] = useState<ThemeId>('ember');
  useEffect(() => {
    void getCountWarmups().then(setCountWarmupsState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getDeloadState().then((d) => setDeloadOn(d.enabled));
    void getThemeId().then(setThemeState);
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
      const content = await exportData(fmt);
      const uri = `${cacheDirectory ?? ''}ischys-export.${fmt}`;
      await writeAsStringAsync(uri, content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: fmt === 'csv' ? 'text/csv' : 'application/json',
          UTI: fmt === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
        });
      } else {
        showToast('Sharing unavailable');
      }
    } catch {
      showToast('Export failed');
    }
  };

  const onExport = () => {
    Alert.alert('Export data', 'Choose a format', [
      { text: 'JSON', onPress: () => doExport('json') },
      { text: 'CSV', onPress: () => doExport('csv') },
      { text: 'Cancel', style: 'cancel' },
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
    // Ensure the bodyweight read is offered — a user who connected Health before
    // this existed won't have granted it, and iOS only prompts for undecided types.
    await requestHealthAuth();
    const kg = await readBodyMass();
    if (kg == null) {
      showToast('No bodyweight in Apple Health');
      return;
    }
    const disp = toDisplay(kg, settings.unit);
    setBwInput(disp != null ? String(Math.round(disp * 10) / 10) : '');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 116 + insets.top },
        ]}
      >
        {/* APPEARANCE — accent only. Surfaces, text and the status colours
            never move with a theme: the app's rule is that accent marks one
            action per screen, and a theme that restyled the greys would be
            recolouring the app rather than that mark. */}
        <Section title="APPEARANCE">
          <View style={styles.themeRow}>
            {PALETTES.map((p) => {
              const on = p.id === theme;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setThemeState(p.id);
                    void setThemeId(p.id);
                  }}
                  style={[styles.themeSwatchWrap, on && styles.themeSwatchOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={p.name}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: p.accent }]} />
                  <Text style={[styles.themeName, on && styles.themeNameOn]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.themeNote}>
            Applies when you next open Ischys.
          </Text>
        </Section>

        {/* TRAINING */}
        <Section
          title="TRAINING"
          footer="Turning this off hides ratings everywhere but keeps them stored. Switching between RPE and RIR converts existing ratings."
        >
          <SegmentRow
            icon={<UnitsIcon size={20} color={color.text2} />}
            label="Units"
            options={UNIT_OPTIONS}
            value={settings.unit}
            onChange={(v) => patch({ unit: v })}
            isLast={false}
          />
          <EffortRow value={settings.effort_mode} onChange={(v) => patch({ effort_mode: v })} />
          <ToggleRow
            icon={<ClockRowIcon size={20} color={color.text2} strokeWidth={2} />}
            label="Auto-start rest timer"
            value={settings.auto_start_rest_timer}
            onChange={(v) => patch({ auto_start_rest_timer: v })}
            isLast={false}
          />
          <ToggleRow
            icon={<BellIcon size={20} color={color.text2} />}
            label="Rest timer alerts"
            value={settings.rest_timer_alerts}
            onChange={(v) => {
              patch({ rest_timer_alerts: v });
              if (v) void maybeAskForExactAlarms(true, { force: true });
            }}
            isLast={false}
          />
          <ToggleRow
            icon={<HapticIcon size={20} color={color.text2} />}
            label="Haptic feedback"
            value={settings.haptic_feedback}
            onChange={(v) => patch({ haptic_feedback: v })}
            isLast={false}
          />
          <ToggleRow
            icon={<WarmupIcon size={20} color={color.text2} />}
            label="Count warmups in volume"
            value={countWarmups}
            onChange={(v) => {
              setCountWarmupsState(v);
              void setCountWarmups(v);
            }}
            isLast={false}
          />
          <ToggleRow
            icon={<WarmupIcon size={20} color={color.text2} />}
            label="Deload advice"
            value={deloadOn}
            onChange={(v) => {
              setDeloadOn(v);
              void getDeloadState().then((d) => setDeloadState({ ...d, enabled: v }));
            }}
            isLast={false}
          />
          <LinkRow
            icon={<DumbbellIcon size={19} color={color.text2} />}
            label="Bar &amp; plates"
            sub="Used by the plate calculator"
            onPress={() => router.push('/plates')}
            isLast={false}
          />
          <TargetRow
            value={weeklyTarget}
            onChange={(n) => {
              setWeeklyTargetState(n);
              void setWeeklyTarget(n);
            }}
            isLast={false}
          />
          <LinkRow
            icon={<BodyweightIcon size={20} color={color.text2} />}
            label="Bodyweight"
            sub="Counts toward volume for bodyweight moves"
            value={bwDisplay != null ? `${bwDisplay} ${bwUnitLabel}` : 'Not set'}
            onPress={openBw}
            isLast
          />
        </Section>

        {/* SERVER */}
        <Section title="DEVICE">
          <LinkRow
            icon={<HeartFilledIcon size={20} color={color.text2} />}
            label="Apple Health"
            sub="Save finished workouts to Fitness"
            onPress={() => router.push('/health')}
            isLast
          />
        </Section>

        <Section title="DATA">
          <LinkRow
            icon={<UploadIcon size={20} color={color.text2} />}
            label="Export data"
            value="CSV / JSON"
            onPress={onExport}
            isLast={false}
          />
          <LinkRow
            icon={<DownloadIcon size={20} color={color.text2} />}
            label="Import workout"
            value="CSV / JSON"
            onPress={onImport}
            isLast={false}
          />
          <MergeRow count={dupCount} onPress={() => router.push('/merge-duplicates')} />
        </Section>

        {/* ABOUT */}
        <Section title="ABOUT">
          <LinkRow
            icon={<ShieldIcon size={20} color={color.text2} />}
            label="Privacy"
            value="On-device"
            onPress={() => {
              const backup = Platform.OS === 'ios' ? 'iCloud' : 'your Google account';
              Alert.alert(
                'Privacy',
                `All your workout data lives on this device only. Nothing is sent to any server or third party. It backs up with your device (${backup}) like any other app.`,
                [
                  {
                    text: 'Privacy policy',
                    onPress: () => {
                      Linking.openURL('https://ischys.app/privacy').catch(() => {});
                    },
                  },
                  { text: 'OK', style: 'cancel' },
                ],
              );
            }}
            isLast={false}
          />
          <LinkRow
            icon={<CodeIcon size={20} color={color.text2} />}
            label="Source code"
            value="GitHub"
            onPress={() => {
              Linking.openURL('https://github.com/ischys-app/Ischys').catch(() => {});
            }}
            isLast={false}
          />
          <LinkRow
            icon={<InfoIcon size={20} color={color.text2} />}
            label="About Ischys"
            value={APP_VERSION ? `v${APP_VERSION}` : undefined}
            onPress={() => {
              Alert.alert(
                'Ischys · ΙΣΧΥΣ',
                `Private, on-device workout tracker.\n\nversion ${APP_VERSION}\n\n` +
                  'Exercise artwork by Workout Guide and Everkinetic, licensed\n' +
                  'CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0).\n\n' +
                  'Ισχύς — strength.',
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
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <BackChevronLeftIcon color={color.text2} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
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
          <Text style={styles.bwTitle}>Bodyweight</Text>
          <Text style={styles.bwText}>
            Used to count bodyweight movements — pull-ups, dips, push-ups — toward your volume.
            It&apos;s snapshotted onto each workout, so changing it never rewrites past sessions.
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
              accessibilityLabel="Bodyweight value"
            />
            <Text style={styles.bwUnit}>{bwUnitLabel}</Text>
          </View>
          {isHealthAvailable() && (
            <Pressable
              onPress={pullBwFromHealth}
              style={({ pressed }) => [styles.bwHealth, pressed && styles.bwHealthPressed]}
              accessibilityRole="button"
            >
              <HeartFilledIcon size={14} color={color.drop} />
              <Text style={styles.bwHealthText}>Use Apple Health</Text>
            </Pressable>
          )}
          <Pressable
            onPress={saveBw}
            style={({ pressed }) => [styles.bwSave, pressed && styles.bwSavePressed]}
            accessibilityRole="button"
          >
            <Text style={styles.bwSaveText}>Save</Text>
          </Pressable>
        </View>
      </DraggableSheet>
    </View>
  );
}

/** Flame glyph for the Count-warmups-in-volume row. */
function WarmupIcon({ size = 20, color: c }: { size?: number; color: string }) {
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
  const step = (delta: number) => {
    const next = Math.min(MAX_WEEKLY_TARGET, Math.max(MIN_WEEKLY_TARGET, value + delta));
    if (next !== value) onChange(next);
  };
  const atMin = value <= MIN_WEEKLY_TARGET;
  const atMax = value >= MAX_WEEKLY_TARGET;
  return (
    <RowShell
      icon={<TargetIcon size={20} color={color.text2} />}
      label="Weekly goal"
      sub="Workouts a week, shown on Home"
      isLast={isLast}
      right={
        <View style={styles.stepper}>
          <Pressable
            onPress={() => step(-1)}
            disabled={atMin}
            hitSlop={6}
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Decrease weekly goal"
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
            accessibilityLabel="Increase weekly goal"
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
  children,
}: {
  title: string;
  /** A note under the card, for a consequence that belongs to no single row. */
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
  return (
    <View style={[styles.effortRow, styles.rowDivider]}>
      <View style={styles.effortTop}>
        <View style={styles.rowIcon}>
          <WarmupIcon size={20} color={color.text2} />
        </View>
        <Text style={[styles.rowLabel, styles.effortLabel]} numberOfLines={1}>
          Effort per set
        </Text>
        <View style={styles.effortSegment} accessibilityRole="radiogroup">
          {EFFORT_OPTIONS.map((opt) => {
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
                accessibilityLabel={`Effort per set: ${opt.label}`}
              >
                <Text style={[styles.effortOptionText, selected && styles.effortOptionTextOn]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.effortHelp}>{EFFORT_HELP[value]}</Text>
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
  value,
  onChange,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  isLast: boolean;
}) {
  return (
    <RowShell
      icon={icon}
      label={label}
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
  options,
  value,
  onChange,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  isLast: boolean;
}) {
  return (
    <RowShell
      icon={icon}
      label={label}
      isLast={isLast}
      right={<Segment options={options} value={value} onChange={onChange} />}
    />
  );
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
  /** Optional trailing value; rows like Apple Health show only a chevron. */
  value?: string;
  sub?: string;
  onPress: () => void;
  isLast: boolean;
  danger?: boolean;
}) {
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
 * Merge-duplicates row (board M1): sub-labelled, with an accent count pill that
 * appears only when duplicates were detected, plus a chevron. Last in DATA.
 */
function MergeRow({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <RowShell
      icon={<MergeIcon size={19} color={color.text2} />}
      label="Merge duplicates"
      sub="Same lift saved twice"
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.9)',
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
    textTransform: 'uppercase',
    paddingLeft: 2,
    paddingRight: 2,
    paddingBottom: 10,
  },
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
  themeNote: {
    fontFamily: font.bodyRegular,
    fontSize: 12,
    color: color.text3,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
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
});
