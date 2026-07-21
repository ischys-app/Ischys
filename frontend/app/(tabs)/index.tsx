import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteRoutine, duplicateRoutine, updateRoutine } from '../../src/api/routines';
import type { Dashboard, RoutineListItem, WorkoutListItem } from '../../src/api/types';
import { getDashboard, listWorkouts, startWorkout } from '../../src/api/workouts';
import { pushWatchState } from '../../src/lib/healthSync';
import { DumbbellIcon, PlusIcon, SearchIcon } from '../../src/components/icons';
import { ResumeWorkoutBar } from '../../src/components/ResumeWorkoutBar';
import { RoutineCard } from '../../src/components/RoutineCard';
import { RoutineMenuSheet } from '../../src/components/RoutineMenuSheet';
import { SectionLabel } from '../../src/components/SectionLabel';
import { StatTile } from '../../src/components/StatTile';
import { StreakPill } from '../../src/components/StreakPill';
import { WeekBars } from '../../src/components/WeekBars';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import { fmtDuration, fmtHeaderDate, fmtVolumeShort } from '../../src/lib/format';
import { color, font } from '../../src/theme/tokens';

/** Home / dashboard — reads the local dashboard, laid out from Home.dc.html. */
export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Header is an absolute overlay of variable height (safe-area inset + content).
  // Measure it so the scroll content clears it on every device, rather than
  // trusting a hardcoded padding that only happened to fit one inset.
  const [headerH, setHeaderH] = useState(0);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<RoutineListItem | null>(null);
  const [active, setActive] = useState<WorkoutListItem | null>(null);

  const refreshDashboard = useCallback(() => {
    return getDashboard()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  // A failure here must not blank the dashboard — swallow it like refreshDashboard.
  const refreshActive = useCallback(() => {
    return listWorkouts({ status: 'active', limit: 1 })
      .then((ws) => setActive(ws[0] ?? null))
      .catch(() => {});
  }, []);

  // Refetch on focus, not just on mount: a routine saved in the builder, or a
  // workout finished elsewhere, must be visible when we come back to Home.
  useFocusEffect(
    useCallback(() => {
      void refreshDashboard();
      void refreshActive();
    }, [refreshDashboard, refreshActive]),
  );

  const startEmpty = async () => {
    try {
      const w = await startWorkout({});
      router.push(`/workout/${w.id}`);
    } catch (e) {
      console.warn(e);
    }
  };

  // Push routines to the Watch's Start screen, and start a workout when the user
  // picks one on the wrist. Only while no workout is active — during a workout
  // the workout screen owns the Watch state, so we must not fight it.
  useEffect(() => {
    if (!data || active) return;
    pushWatchState({
      screen: 'start',
      routines: data.routines.map((r) => ({
        id: r.id,
        name: r.name,
        initials: r.initials,
        exerciseCount: r.exercise_count,
      })),
    });
  }, [data, active]);

  const startRoutine = async (r: RoutineListItem) => {
    try {
      const w = await startWorkout({ routine_id: r.id });
      router.push(`/workout/${w.id}`);
    } catch (e) {
      console.warn(e);
    }
  };

  const isFirstRun = !!data && data.routines.length === 0 && data.recent.length === 0;

  const handleRename = async (newName: string) => {
    if (!menuFor) return;
    try {
      await updateRoutine(menuFor.id, { name: newName });
      await refreshDashboard();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleDuplicate = async () => {
    if (!menuFor) return;
    try {
      await duplicateRoutine(menuFor.id);
      await refreshDashboard();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleDelete = async () => {
    if (!menuFor) return;
    try {
      await deleteRoutine(menuFor.id);
      await refreshDashboard();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleReorder = () => {
    Alert.alert('Coming soon', 'Reorder routines is not yet implemented.');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, headerH ? { paddingTop: headerH } : null]}
      >
        {error && <Text style={styles.error}>{error}</Text>}
        {!data && !error && <Text style={styles.loading}>Loading…</Text>}

        {data && isFirstRun && <EmptyState onStartEmpty={startEmpty} />}
        {data && !isFirstRun && (
          <Populated
            data={data}
            onStartEmpty={startEmpty}
            onStartRoutine={startRoutine}
            onOverflow={setMenuFor}
          />
        )}

      </ScrollView>

      {active && !isFirstRun && (
        <ResumeWorkoutBar
          name={active.name}
          startedAt={active.started_at}
          onPress={() => router.push(`/workout/${active.id}`)}
        />
      )}

      {/* Fixed header overlay */}
      <View
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <View style={styles.wordmark}>
          <Text style={styles.wordmarkText}>Ischys</Text>
          <View style={styles.wordmarkDot} />
        </View>
      </View>

      <RoutineMenuSheet
        visible={!!menuFor}
        routineName={menuFor?.name ?? ''}
        initials={menuFor?.initials}
        subline={menuFor ? `${menuFor.exercise_count} exercises` : undefined}
        onEdit={() => menuFor && router.push(`/routine/${menuFor.id}`)}
        onRename={handleRename}
        onDuplicate={handleDuplicate}
        onReorder={handleReorder}
        onDelete={handleDelete}
        onClose={() => setMenuFor(null)}
      />
    </View>
  );
}

function Populated({
  data,
  onStartEmpty,
  onStartRoutine,
  onOverflow,
}: {
  data: Dashboard;
  onStartEmpty: () => void;
  onStartRoutine: (r: RoutineListItem) => void;
  onOverflow: (r: RoutineListItem) => void;
}) {
  const router = useRouter();
  const vol = fmtVolumeShort(data.stats.volume);
  return (
    <View>
      {/* Weekly summary heading */}
      <View style={styles.summaryHead}>
        <View>
          <Text style={styles.dateLabel}>{fmtHeaderDate(data.date)}</Text>
          <Text style={styles.thisWeek}>This week</Text>
        </View>
        <StreakPill days={data.stats.streak_days} />
      </View>

      {/* Stat card */}
      <View style={styles.statCard}>
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <StatTile label="Workouts" value={String(data.stats.workouts_done)} unit={` / ${data.stats.workouts_target}`} />
            </View>
            <View style={styles.gridCell}>
              <StatTile label="Volume" value={vol.value} unit={vol.unit} />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <StatTile label="Sets" value={String(data.stats.sets)} />
            </View>
            <View style={styles.gridCell}>
              <StatTile label="Time" value={fmtDuration(data.stats.time_seconds)} unit=" h" />
            </View>
          </View>
        </View>
        <WeekBars week={data.week} />
      </View>

      {/* Quick start */}
      <SectionLabel style={styles.quickStartLabel}>Quick Start</SectionLabel>
      <Pressable onPress={onStartEmpty} style={({ pressed }) => [styles.quickStart, pressed && styles.quickStartPressed]}>
        <PlusIcon size={16} color={color.accent} strokeWidth={2.4} />
        <Text style={styles.quickStartText}>Start Empty Workout</Text>
      </Pressable>

      {/* My routines */}
      <View style={styles.sectionHead}>
        <SectionLabel>
          My Routines <Text style={styles.count}>({data.routines.length})</Text>
        </SectionLabel>
        <View style={styles.pillRow}>
          <Pressable
            onPress={() => router.push('/routine/new')}
            style={({ pressed }) => [styles.smallPill, pressed && styles.smallPillPressed]}
          >
            <PlusIcon size={13} color={color.text1} strokeWidth={2.4} />
            <Text style={styles.smallPillText}>New</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/exercise-library?browse=1')}
            style={({ pressed }) => [styles.smallPill, pressed && styles.smallPillPressed]}
          >
            <SearchIcon size={13} color={color.text1} strokeWidth={2.2} />
            <Text style={styles.smallPillText}>Explore</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.routineList}>
        {data.routines.map((r) => (
          <RoutineCard
            key={r.id}
            routine={r}
            onStart={() => onStartRoutine(r)}
            onOverflow={() => onOverflow(r)}
          />
        ))}
      </View>

      {/* Recent */}
      <View style={styles.sectionHead}>
        <SectionLabel>Recent</SectionLabel>
        <Text style={styles.allHistory} onPress={() => router.navigate('/(tabs)/history')}>
          All history
        </Text>
      </View>
      <View style={styles.recentList}>
        {data.recent.map((w) => (
          <WorkoutCard key={w.id} workout={w} onPress={() => router.push(`/summary/${w.id}`)} />
        ))}
      </View>
    </View>
  );
}

function EmptyState({ onStartEmpty }: { onStartEmpty: () => void }) {
  const router = useRouter();
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <DumbbellIcon size={30} color={color.accent} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>Welcome to Ischys</Text>
      <Text style={styles.emptySub}>
        Your training log lives on your device — nothing leaves it. Build a routine to get started, or jump straight
        into an empty session.
      </Text>
      <View style={styles.emptyButtons}>
        <Pressable
          onPress={() => router.push('/routine/new')}
          style={({ pressed }) => [styles.emptyPrimary, pressed && styles.emptyPrimaryPressed]}
        >
          <PlusIcon size={17} color={color.accentFg} strokeWidth={2.6} />
          <Text style={styles.emptyPrimaryText}>Create your first routine</Text>
        </Pressable>
        <Pressable onPress={onStartEmpty} style={({ pressed }) => [styles.emptySecondary, pressed && styles.emptySecondaryPressed]}>
          <Text style={styles.emptySecondaryText}>Start empty workout</Text>
        </Pressable>
      </View>
      <Text style={styles.emptyImport} onPress={() => router.push('/import')}>
        Coming from another app? <Text style={styles.emptyImportLink}>Import your history →</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingTop: 108, paddingBottom: 108, paddingHorizontal: 16 },
  loading: { fontFamily: font.bodyRegular, fontSize: 16, color: color.text3 },
  error: { fontFamily: font.bodyRegular, fontSize: 13, color: color.error },

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
  wordmark: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  wordmarkText: {
    fontFamily: font.displayBold,
    fontSize: 22,
    letterSpacing: -0.66,
    color: color.text1,
  },
  wordmarkDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },

  // Weekly summary heading
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  dateLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.4,
    color: color.text3,
    textTransform: 'uppercase',
    fontVariant: ['tabular-nums'],
  },
  thisWeek: {
    fontFamily: font.displayBold,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
    marginTop: 2,
  },

  // Stat card
  statCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 18,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginBottom: 24,
  },
  grid: { flexDirection: 'column', gap: 16, marginBottom: 18 },
  gridRow: { flexDirection: 'row', gap: 12 },
  gridCell: { flex: 1 },

  // Quick start
  quickStartLabel: { paddingHorizontal: 2, paddingBottom: 10 },
  quickStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    marginBottom: 26,
  },
  quickStartPressed: { borderColor: color.text3 },
  quickStartText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text2,
  },

  // Section header row
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  count: { color: color.text2 },
  pillRow: { flexDirection: 'row', gap: 8 },
  smallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
  },
  smallPillPressed: { borderColor: color.accent },
  smallPillText: {
    fontFamily: font.titleSemi,
    fontSize: 12.5,
    color: color.text1,
  },

  routineList: { flexDirection: 'column', gap: 12, marginBottom: 26 },

  allHistory: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text2,
  },
  recentList: { flexDirection: 'column', gap: 10 },

  // Empty state
  empty: { flexDirection: 'column', alignItems: 'center', paddingTop: 44, paddingHorizontal: 8 },
  emptyIcon: {
    width: 66,
    height: 66,
    borderRadius: 18,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  emptyTitle: {
    fontFamily: font.displayBold,
    fontSize: 25,
    letterSpacing: -0.5,
    color: color.text1,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: font.bodyRegular,
    fontSize: 14.5,
    color: color.text2,
    lineHeight: 22,
    maxWidth: 290,
    marginTop: 10,
    textAlign: 'center',
  },
  emptyButtons: { flexDirection: 'column', gap: 10, width: '100%', marginTop: 28 },
  emptyPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 50,
    borderRadius: 13,
    backgroundColor: color.accent,
  },
  emptyPrimaryPressed: { opacity: 0.9 },
  emptyPrimaryText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
  emptySecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
  },
  emptySecondaryPressed: { borderColor: color.text3 },
  emptySecondaryText: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
  },
  emptyImport: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    marginTop: 22,
    textAlign: 'center',
  },
  emptyImportLink: { color: color.accent },
});
