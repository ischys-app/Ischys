/**
 * Apple Health screen — Settings-adjacent surface that manages the Apple Health
 * integration. Two visual states driven by a local `connected` boolean persisted
 * in SecureStore under `ischys.healthConnected`.
 *
 * Source of truth: export/ischys-app/Health.dc.html.
 *
 * The real HealthKit binding is guarded behind a dynamic import so this screen
 * renders (and toggles work) on Android / simulators / dev clients that don't
 * ship a native HealthKit module.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../src/components/ui';
import { BackChevronIcon, HeartFilledIcon, ShieldIcon } from '../src/components/icons';
import { fmtAgo } from '../src/lib/format';
import { connectHealth, isHealthAvailable } from '../src/lib/healthSync';
import { color, font } from '../src/theme/tokens';

// SecureStore keys
const K_CONNECTED = 'ischys.healthConnected';
const K_LAST_SYNC = 'ischys.healthLastSync';
const K_WRITTEN = 'ischys.healthWorkoutsWritten';
const K_PREF = {
  writeWorkouts: 'ischys.healthPref.writeWorkouts',
  readHR: 'ischys.healthPref.readHR',
  readBody: 'ischys.healthPref.readBody',
  readEnergy: 'ischys.healthPref.readEnergy',
} as const;

type PrefKey = keyof typeof K_PREF;

const DEFAULT_PREFS: Record<PrefKey, boolean> = {
  writeWorkouts: true,
  readHR: true,
  readBody: false,
  readEnergy: true,
};

const SUCCESS_TINT_BG = 'rgba(45,216,129,0.10)';
const SUCCESS_TINT_BORDER = 'rgba(45,216,129,0.28)';
const SUCCESS_HALO = 'rgba(45,216,129,0.20)';

export default function Health() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loaded, setLoaded] = useState(false);
  const [connected, setConnectedState] = useState(false);
  const [prefs, setPrefsState] = useState<Record<PrefKey, boolean>>(DEFAULT_PREFS);
  const [workoutsWritten, setWorkoutsWritten] = useState<number>(0);
  const [lastSyncIso, setLastSyncIso] = useState<string | null>(null);

  // Load persisted state on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [c, w, ls, ww, wh, rh, rb, re] = await Promise.all([
        SecureStore.getItemAsync(K_CONNECTED),
        SecureStore.getItemAsync(K_WRITTEN),
        SecureStore.getItemAsync(K_LAST_SYNC),
        SecureStore.getItemAsync(K_PREF.writeWorkouts),
        SecureStore.getItemAsync(K_PREF.writeWorkouts),
        SecureStore.getItemAsync(K_PREF.readHR),
        SecureStore.getItemAsync(K_PREF.readBody),
        SecureStore.getItemAsync(K_PREF.readEnergy),
      ]);
      if (cancelled) return;
      setConnectedState(c === '1');
      setWorkoutsWritten(w ? Number(w) || 0 : 0);
      setLastSyncIso(ls);
      setPrefsState({
        writeWorkouts: ww == null ? DEFAULT_PREFS.writeWorkouts : ww === '1',
        readHR: rh == null ? DEFAULT_PREFS.readHR : rh === '1',
        readBody: rb == null ? DEFAULT_PREFS.readBody : rb === '1',
        readEnergy: re == null ? DEFAULT_PREFS.readEnergy : re === '1',
      });
      // The `wh` alias above is only there so we can drop the first
      // duplicate result cleanly — swallow unused-var warning.
      void wh;
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistConnected = async (v: boolean) => {
    setConnectedState(v);
    if (v) {
      await SecureStore.setItemAsync(K_CONNECTED, '1');
      await SecureStore.setItemAsync(K_LAST_SYNC, new Date().toISOString());
      setLastSyncIso(new Date().toISOString());
    } else {
      await SecureStore.deleteItemAsync(K_CONNECTED);
    }
  };

  const setPref = async (key: PrefKey, next: boolean) => {
    setPrefsState((p) => ({ ...p, [key]: next }));
    await SecureStore.setItemAsync(K_PREF[key], next ? '1' : '0');
  };

  const clearPrefs = async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(K_PREF.writeWorkouts),
      SecureStore.deleteItemAsync(K_PREF.readHR),
      SecureStore.deleteItemAsync(K_PREF.readBody),
      SecureStore.deleteItemAsync(K_PREF.readEnergy),
      SecureStore.deleteItemAsync(K_LAST_SYNC),
      SecureStore.deleteItemAsync(K_WRITTEN),
    ]);
    setPrefsState(DEFAULT_PREFS);
    setWorkoutsWritten(0);
    setLastSyncIso(null);
  };

  const onConnect = async () => {
    if (!isHealthAvailable()) {
      Alert.alert(
        'Not available',
        'Apple Health needs a device build with HealthKit — it is not available on the simulator or on Android.',
      );
      return;
    }
    // Real HealthKit prompt. The user answering does not tell us what they
    // granted (HealthKit hides write grants), so a denied save simply no-ops.
    const ok = await connectHealth();
    if (ok) {
      setConnectedState(true);
      setLastSyncIso(new Date().toISOString());
    }
  };

  const onDisconnect = () => {
    Alert.alert(
      'Disconnect Apple Health',
      'Ischys will stop reading and writing Health data. Any records already written stay in Health.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await persistConnected(false);
              await clearPrefs();
            })();
          },
        },
      ],
    );
  };

  const lastAgo = fmtAgo(lastSyncIso) || 'just now';

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <BackChevronIcon color={color.text2} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Apple Health</Text>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 116 + insets.top },
        ]}
      >
        {loaded && !connected && (
          <Disconnected onConnect={onConnect} />
        )}

        {loaded && connected && (
          <Connected
            lastAgo={lastAgo}
            workoutsWritten={workoutsWritten}
            prefs={prefs}
            onTogglePref={setPref}
            onDisconnect={onDisconnect}
          />
        )}
      </ScrollView>
    </View>
  );
}

// --- Disconnected state ---------------------------------------------------

function Disconnected({ onConnect }: { onConnect: () => void }) {
  return (
    <View style={styles.discRoot}>
      <View style={styles.discHero}>
        <HeartFilledIcon size={34} color={color.error} />
      </View>
      <Text style={styles.discTitle}>Apple Health</Text>
      <Text style={styles.discCopy}>
        Sync finished workouts as Traditional Strength Training and read your
        heart rate live from Apple Watch during a session. Read only what Ischys
        writes back.
      </Text>
      <View style={styles.discBtnWrap}>
        <Button
          label="Connect Apple Health"
          onPress={onConnect}
          icon={<HeartFilledIcon size={17} color={color.accentFg} />}
        />
      </View>
      <View style={styles.privacyRow}>
        <ShieldIcon size={15} color={color.text3} />
        <Text style={styles.privacyNote}>
          Health data never leaves your device — Ischys reads only what it writes back.
        </Text>
      </View>
    </View>
  );
}

// --- Connected state ------------------------------------------------------

/** `enabled: false` rows render inert with a "Soon" tag. Only writing workouts
 *  is wired to a real path today; the reads would toggle a preference that
 *  nothing consumes yet (heart rate needs an Apple Watch recording the session). */
const PREF_ROWS: { key: PrefKey; label: string; sub: string; enabled: boolean }[] = [
  {
    key: 'writeWorkouts',
    label: 'Write workouts to Health',
    sub: 'Saved as Traditional Strength Training when you finish',
    enabled: true,
  },
  {
    key: 'readHR',
    label: 'Read heart rate during workout',
    sub: 'Live BPM + avg/max, from an Apple Watch',
    enabled: true,
  },
  {
    key: 'readBody',
    label: 'Read body measurements',
    sub: 'Bodyweight, body fat %',
    enabled: false,
  },
  {
    key: 'readEnergy',
    label: 'Read active energy (calories)',
    sub: 'Calories burned per session',
    enabled: false,
  },
];

function Connected({
  lastAgo,
  workoutsWritten,
  prefs,
  onTogglePref,
  onDisconnect,
}: {
  lastAgo: string;
  workoutsWritten: number;
  prefs: Record<PrefKey, boolean>;
  onTogglePref: (k: PrefKey, next: boolean) => void;
  onDisconnect: () => void;
}) {
  return (
    <View style={styles.connRoot}>
      {/* Status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusHalo}>
          <View style={styles.statusDot} />
        </View>
        <View style={styles.statusTextCol}>
          <Text style={styles.statusTitle}>Connected</Text>
          <Text style={styles.statusSub}>Apple Health · this iPhone</Text>
        </View>
        <HeartFilledIcon size={22} color={color.error} />
      </View>

      {/* Permission toggles */}
      <View style={styles.card}>
        {PREF_ROWS.map((row, i) => (
          <ToggleRow
            key={row.key}
            label={row.label}
            sub={row.sub}
            value={row.enabled && prefs[row.key]}
            enabled={row.enabled}
            onChange={(v) => onTogglePref(row.key, v)}
            isLast={i === PREF_ROWS.length - 1}
          />
        ))}
      </View>

      {/* Stats block */}
      <View style={styles.statsCard}>
        <View style={styles.statCell}>
          <Text style={styles.statCellLabel}>WORKOUTS WRITTEN</Text>
          <Text style={styles.statCellValue}>{String(workoutsWritten)}</Text>
        </View>
        <View style={styles.statCellDivider} />
        <View style={styles.statCell}>
          <Text style={styles.statCellLabel}>LAST SYNCED</Text>
          <Text style={styles.statCellValue}>{lastAgo}</Text>
        </View>
      </View>

      {/* Disconnect */}
      <Pressable
        onPress={onDisconnect}
        style={({ pressed }) => [styles.disconnectBtn, pressed && styles.disconnectBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Disconnect Apple Health"
      >
        <Text style={styles.disconnectBtnText}>Disconnect Apple Health</Text>
      </Pressable>
    </View>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  enabled,
  onChange,
  isLast,
}: {
  label: string;
  sub: string;
  value: boolean;
  enabled: boolean;
  onChange: (next: boolean) => void;
  isLast: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={!enabled}
      style={({ pressed }) => [
        styles.toggleRow,
        !isLast && styles.toggleRowDivider,
        pressed && styles.toggleRowPressed,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !enabled }}
      accessibilityLabel={label}
    >
      <View style={styles.toggleTextCol}>
        <View style={styles.toggleLabelRow}>
          <Text style={[styles.toggleLabel, !enabled && styles.toggleLabelOff]}>{label}</Text>
          {!enabled && (
            <View style={styles.soonChip}>
              <Text style={styles.soonChipText}>SOON</Text>
            </View>
          )}
        </View>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <View
        style={[
          styles.toggleTrack,
          { backgroundColor: value ? color.accent : color.surface3 },
          !enabled && styles.toggleTrackOff,
        ]}
      >
        <View style={[styles.toggleKnob, { left: value ? 21 : 3 }]} />
      </View>
    </Pressable>
  );
}

// --- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

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

  // --- Disconnected -------
  discRoot: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingTop: 46,
    paddingBottom: 30,
  },
  discHero: {
    width: 74,
    height: 74,
    borderRadius: 20,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  discTitle: {
    fontFamily: font.displayBold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.48,
    color: color.text1,
    textAlign: 'center',
  },
  discCopy: {
    fontFamily: font.bodyRegular,
    fontSize: 14.5,
    lineHeight: 22,
    color: color.text2,
    textAlign: 'center',
    marginTop: 10,
    maxWidth: 300,
  },
  discBtnWrap: {
    width: '100%',
    marginTop: 28,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    alignSelf: 'stretch',
  },
  privacyNote: {
    flex: 1,
    fontFamily: font.monoRegular,
    fontSize: 11,
    lineHeight: 17,
    color: color.text3,
  },

  // --- Connected ---------
  connRoot: {
    paddingTop: 18,
    paddingBottom: 32,
    gap: 18,
  },

  // Status card
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
  statusTextCol: { flex: 1, minWidth: 0 },
  statusTitle: {
    fontFamily: font.titleSemi,
    fontSize: 13.5,
    fontWeight: '600',
    color: color.text1,
  },
  statusSub: {
    fontFamily: font.bodyMedium,
    fontSize: 12,
    color: color.text2,
    lineHeight: 18,
    marginTop: 2,
  },

  // Section card
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    overflow: 'hidden',
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  toggleRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  toggleRowPressed: { opacity: 0.85 },
  toggleTextCol: { flex: 1, minWidth: 0 },
  toggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  toggleLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 14.5,
    fontWeight: '500',
    color: color.text1,
  },
  toggleLabelOff: { color: color.text2 },
  soonChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    backgroundColor: color.surface3,
  },
  soonChipText: {
    fontFamily: font.monoRegular,
    fontSize: 8.5,
    letterSpacing: 0.85,
    color: color.text3,
  },
  toggleSub: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 2,
  },

  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    position: 'relative',
    flexShrink: 0,
  },
  toggleTrackOff: { opacity: 0.4 },
  toggleKnob: {
    position: 'absolute',
    top: 3,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },

  // Stats block
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  statCell: { flex: 1, minWidth: 0, gap: 3 },
  statCellDivider: {
    width: 1,
    height: 30,
    backgroundColor: color.hair,
  },
  statCellLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: color.text3,
    textTransform: 'uppercase',
  },
  statCellValue: {
    fontFamily: font.monoSemi,
    fontSize: 15,
    fontWeight: '600',
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },

  // Disconnect
  disconnectBtn: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disconnectBtnPressed: { opacity: 0.7 },
  disconnectBtnText: {
    fontFamily: font.bodyMedium,
    fontSize: 14,
    fontWeight: '500',
    color: color.error,
  },
});
