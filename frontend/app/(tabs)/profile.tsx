import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ProfileOut, RecordOut, WorkoutListItem } from '../../src/api/types';
import { getProfile, listRecentRecords, listWorkouts } from '../../src/api/workouts';
import { HeartFilledIcon, SettingsIcon, StarIcon } from '../../src/components/icons';
import { fmtMonthYear, fmtVolumeLarge, metricLabel } from '../../src/lib/format';
import { buildWeeklyBars, WEEK_BARS, type WeeklyBars } from '../../src/lib/weeklyBars';
import { DEFAULT_NAME, setProfileName } from '../../src/lib/profileName';
import { color, font } from '../../src/theme/tokens';

const BAR_MAX_HEIGHT = 56;
const BAR_MIN_HEIGHT = 3;

const SUCCESS_TINT_BG = 'rgba(45,216,129,0.06)';
const SUCCESS_TINT_BORDER = 'rgba(45,216,129,0.22)';
const SUCCESS_HALO = 'rgba(45,216,129,0.20)';

/** Profile tab — identity, aggregate stats, weekly bars, PRs, sync status. */
export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Header is an absolute overlay of variable height (safe-area inset + content).
  // Measure it so the scroll content clears it on every device, rather than
  // trusting a hardcoded padding that only happened to fit one inset.
  const [headerH, setHeaderH] = useState(0);

  const [profile, setProfile] = useState<ProfileOut | null>(null);
  const [records, setRecords] = useState<RecordOut[] | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthConnected, setHealthConnected] = useState(false);

  // Inline name editing. `draft` is null when not editing.
  const [draft, setDraft] = useState<string | null>(null);
  const beginEditName = () => setDraft(profile && profile.name !== DEFAULT_NAME ? profile.name : '');
  const commitName = async () => {
    if (draft === null) return;
    const next = draft.trim() || DEFAULT_NAME;
    setDraft(null);
    setProfile((p) => (p ? { ...p, name: next } : p)); // optimistic
    await setProfileName(next);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getProfile().catch(() => null),
      listRecentRecords(10).catch(() => [] as RecordOut[]),
      listWorkouts({ limit: 300, status: 'completed' }).catch(() => [] as WorkoutListItem[]),
    ])
      .then(([p, r, w]) => {
        if (cancelled) return;
        setProfile(p);
        setRecords(r);
        setWorkouts(w);
        setLoading(false);
      })
      .catch(() => {
        // Each call above already catches, so this cannot fire today — but a
        // rejection here would otherwise leave the spinner up forever.
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh Health-connection flag whenever this tab regains focus (e.g. after
  // connecting in /health), so the pill appears/disappears without a full reload.
  useFocusEffect(
    useCallback(() => {
      try {
        setHealthConnected(SecureStore.getItem('ischys.healthConnected') === '1');
      } catch {
        // web / unsupported platform — leave prior value
      }
    }, []),
  );

  const bars = useMemo<WeeklyBars>(() => {
    if (!workouts) return { counts: Array(WEEK_BARS).fill(0), avg: 0, max: 0, ticks: [] };
    return buildWeeklyBars(workouts);
  }, [workouts]);

  const stats = profile?.stats;
  const vol = stats ? fmtVolumeLarge(stats.volume_lifted) : { value: '—', unit: '' };
  const trainingSince = fmtMonthYear(profile?.training_since);
  const location = profile?.location ?? '';
  const subtitle = location && trainingSince
    ? `${location} · training since ${trainingSince}`
    : location
      ? location
      : trainingSince
        ? `training since ${trainingSince}`
        : '';
  const initial = (profile?.name?.trim()?.[0] ?? '—').toUpperCase();
  const year = new Date().getFullYear();

  const displayStats: { label: string; value: string; unit: string }[] = [
    { label: 'WORKOUTS', value: stats ? String(stats.workouts) : '—', unit: '' },
    { label: 'THIS YEAR', value: stats ? String(stats.this_year) : '—', unit: '' },
    { label: 'VOLUME LIFTED', value: vol.value, unit: vol.unit },
    { label: 'CURRENT STREAK', value: stats ? String(stats.current_streak) : '—', unit: ' wk' },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, headerH ? { paddingTop: headerH } : null]}
      >
        {loading && <Text style={styles.loading}>Loading…</Text>}

        {!loading && (
          <View>
            {/* Identity row */}
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initial}</Text>
              </View>
              <View style={styles.identityText}>
                {draft !== null ? (
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    onSubmitEditing={commitName}
                    onBlur={commitName}
                    placeholder={DEFAULT_NAME}
                    placeholderTextColor={color.text3}
                    autoFocus
                    autoCapitalize="words"
                    returnKeyType="done"
                    maxLength={40}
                    selectionColor={color.accent}
                    style={[styles.name, styles.nameInput]}
                    accessibilityLabel="Your name"
                  />
                ) : (
                  <Text
                    style={styles.name}
                    numberOfLines={1}
                    onPress={beginEditName}
                    accessibilityRole="button"
                    accessibilityLabel="Edit your name"
                  >
                    {profile?.name ?? '—'}
                  </Text>
                )}
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
            </View>

            {/* Stats grid */}
            <View style={styles.grid}>
              <View style={styles.gridRow}>
                {displayStats.slice(0, 2).map((s) => (
                  <StatCell key={s.label} label={s.label} value={s.value} unit={s.unit} />
                ))}
              </View>
              <View style={styles.gridRow}>
                {displayStats.slice(2, 4).map((s) => (
                  <StatCell key={s.label} label={s.label} value={s.value} unit={s.unit} />
                ))}
              </View>
            </View>

            {/* Weekly bars card */}
            <View style={styles.barsCard}>
              <View style={styles.barsHeader}>
                <Text style={styles.barsLabel}>{`WORKOUTS / WEEK · ${year}`}</Text>
                <Text style={styles.barsAvg}>{`avg ${bars.avg.toFixed(1)}`}</Text>
              </View>
              <View style={styles.barsRow}>
                {bars.counts.map((count, i) => {
                  const height =
                    count === 0 || bars.max === 0
                      ? BAR_MIN_HEIGHT
                      : Math.max(BAR_MIN_HEIGHT, (count / bars.max) * BAR_MAX_HEIGHT);
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        {
                          height,
                          backgroundColor: count > 0 ? color.accent : color.surface3,
                        },
                      ]}
                    />
                  );
                })}
              </View>
              {/* Month axis — a label under the bar where each month begins, so
                  the 26 weeks read against the calendar rather than floating. */}
              <View style={styles.axisRow} pointerEvents="none">
                {bars.counts.map((_, i) => {
                  const tick = bars.ticks.find((t) => t.index === i);
                  return (
                    <View key={i} style={styles.axisCell}>
                      {tick && <Text style={styles.axisLabel}>{tick.label}</Text>}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Records */}
            <Text style={styles.recordsLabel}>RECENT RECORDS</Text>
            <View style={styles.recordsList}>
              {records && records.length === 0 && (
                <Text style={styles.emptyRecords}>No records yet — finish a workout to log your first PR.</Text>
              )}
              {records?.map((r, i) => (
                // Name the lift once the backend sends it (GET /records/recent);
                // fall back to the metric label until that deploys.
                <View key={`${r.metric}-${i}`} style={styles.recordRow}>
                  <StarIcon size={16} color={color.success} strokeWidth={2.2} />
                  <Text style={styles.recordName} numberOfLines={1}>
                    {r.exercise_name || metricLabel(r.metric)}
                  </Text>
                  <Text style={styles.recordValue}>{r.display}</Text>
                </View>
              ))}
            </View>

            {/* Self-hosted status */}
            <View style={styles.statusCard}>
              <View style={styles.statusHalo}>
                <View style={styles.statusDot} />
              </View>
              <View style={styles.statusText}>
                <Text style={styles.statusTitle}>On this device · not synced</Text>
                <Text style={styles.statusSub}>Backs up with iCloud</Text>
              </View>
              <Text style={styles.statusBadge}>SQLite</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Fixed header overlay */}
      <View
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <Text style={styles.title}>Profile</Text>
        <View style={styles.headerRight}>
          {healthConnected && (
            <Pressable
              onPress={() => router.push('/health')}
              hitSlop={6}
              style={({ pressed }) => [styles.healthChip, pressed && styles.healthChipPressed]}
              accessibilityLabel="Apple Health connected"
              accessibilityRole="button"
            >
              <HeartFilledIcon size={12} color={color.success} />
              <Text style={styles.healthChipText}>Health · connected</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/settings')}
            hitSlop={6}
            style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <SettingsIcon size={18} color={color.text2} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function StatCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingTop: 108, paddingBottom: 108, paddingHorizontal: 16 },
  loading: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text3,
    textAlign: 'center',
    marginTop: 24,
  },

  // Fixed header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: color.bg,
  },
  title: {
    fontFamily: font.displayBold,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  healthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(45,216,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(45,216,129,0.24)',
  },
  healthChipPressed: { opacity: 0.75 },
  healthChipText: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    fontWeight: '600',
    color: color.success,
  },
  settingsButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: { borderColor: color.text3 },

  // Identity row
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 22,
    paddingHorizontal: 2,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: color.surface3,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontFamily: font.monoBold,
    fontSize: 22,
    color: color.accent,
  },
  identityText: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: font.displayBold,
    fontSize: 20,
    letterSpacing: -0.4,
    color: color.text1,
  },
  nameInput: {
    padding: 0,
    marginVertical: -2, // keep the row height stable when swapping Text -> TextInput
  },
  subtitle: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    marginTop: 3,
  },

  // Stats grid
  grid: { flexDirection: 'column', gap: 10, marginBottom: 12 },
  gridRow: { flexDirection: 'row', gap: 10 },
  statCell: {
    flex: 1,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 15,
    padding: 15,
  },
  statLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: color.text3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontFamily: font.monoMedium,
    fontSize: 13,
    color: color.text3,
    letterSpacing: 0,
  },

  // Weekly bars card
  barsCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  barsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  barsLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.text3,
    textTransform: 'uppercase',
  },
  barsAvg: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.success,
    fontVariant: ['tabular-nums'],
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 3,
    height: 60,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minHeight: BAR_MIN_HEIGHT,
  },
  axisRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 7,
  },
  axisCell: {
    flex: 1,
    alignItems: 'center',
    // Let a month label spill past its thin bar cell rather than clip.
    overflow: 'visible',
  },
  axisLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },

  // Records
  recordsLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  recordsList: { flexDirection: 'column', gap: 8, marginBottom: 24 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recordName: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    color: color.text1,
  },
  recordValue: {
    fontFamily: font.monoSemi,
    fontSize: 13.5,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  emptyRecords: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    color: color.text3,
    textAlign: 'center',
    paddingVertical: 12,
  },

  // Self-hosted status
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: SUCCESS_TINT_BG,
    borderWidth: 1,
    borderColor: SUCCESS_TINT_BORDER,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statusHalo: {
    width: 17,
    height: 17,
    borderRadius: 999,
    backgroundColor: SUCCESS_HALO,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: color.success,
  },
  statusText: { flex: 1, minWidth: 0 },
  statusTitle: {
    fontFamily: font.titleSemi,
    fontSize: 13.5,
    color: color.text1,
  },
  statusSub: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    marginTop: 2,
  },
  statusBadge: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.success,
    flexShrink: 0,
  },
});
