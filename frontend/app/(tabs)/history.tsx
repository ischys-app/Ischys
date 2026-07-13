import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityDay, ActivityMapOut, WorkoutListItem } from '../../src/api/types';
import { deleteWorkout, getActivityMap, listWorkouts, startWorkout } from '../../src/api/workouts';
import { ClockCenteredIcon, PlayIcon } from '../../src/components/icons';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import {
  addDays,
  fmtHistoryGroupTitle,
  parseIso,
  startOfDay,
  startOfIsoWeek,
} from '../../src/lib/format';
import { color, font } from '../../src/theme/tokens';

const HEAT_WEEKS = 12;
const HEAT_DAYS = HEAT_WEEKS * 7; // 84

/** Shade for a heat-map cell given its 0..3 intensity. */
function shadeForIntensity(i: number): string {
  if (i >= 3) return color.accent;
  if (i === 2) return 'rgba(255,74,28,0.62)';
  if (i === 1) return 'rgba(255,74,28,0.35)';
  return color.surface3;
}

/** Bucket workouts into ordered groups by their group title (THIS/LAST WEEK, else month). */
function groupWorkouts(workouts: WorkoutListItem[]): { title: string; items: WorkoutListItem[] }[] {
  const now = new Date();
  const groups: { title: string; items: WorkoutListItem[] }[] = [];
  const byTitle = new Map<string, WorkoutListItem[]>();
  for (const w of workouts) {
    const title = fmtHistoryGroupTitle(w.started_at, now);
    let bucket = byTitle.get(title);
    if (!bucket) {
      bucket = [];
      byTitle.set(title, bucket);
      groups.push({ title, items: bucket });
    }
    bucket.push(w);
  }
  return groups;
}

/**
 * Build 12 columns of 7 days (Mon..Sun, oldest column first) from a flat list of
 * `ActivityDay`s. Days present in the payload are placed at their exact Mon-index;
 * everything else is padded with intensity 0.
 */
function buildHeatColumns(days: ActivityDay[]): number[][] {
  const today = startOfDay(new Date());
  const thisMon = startOfIsoWeek(today);
  const firstMon = addDays(thisMon, -(HEAT_WEEKS - 1) * 7);
  const grid: number[][] = Array.from({ length: HEAT_WEEKS }, () => Array(7).fill(0));
  for (const d of days) {
    const dt = startOfDay(parseIso(d.date));
    const diff = Math.floor((dt.getTime() - firstMon.getTime()) / 86_400_000);
    if (diff < 0 || diff >= HEAT_DAYS) continue;
    const col = Math.floor(diff / 7);
    const row = diff % 7;
    grid[col][row] = d.intensity;
  }
  return grid;
}

/** History tab — completed workouts + 12-week activity heatmap. */
export default function History() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Header is an absolute overlay of variable height (safe-area inset + content).
  // Measure it so the scroll content clears it on every device, rather than
  // trusting a hardcoded padding that only happened to fit one inset.
  const [headerH, setHeaderH] = useState(0);
  const [workouts, setWorkouts] = useState<WorkoutListItem[] | null>(null);
  const [activity, setActivity] = useState<ActivityMapOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([listWorkouts({ limit: 100, status: 'completed' }), getActivityMap(HEAT_WEEKS)])
        .then(([ws, a]) => {
          setWorkouts(ws);
          setActivity(a);
          setError(null);
        })
        .catch((e) => setError(String(e))),
    [],
  );

  // On focus, not just on mount: a workout finished or deleted elsewhere must be
  // reflected when we come back to this tab.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /** Long-press a card. Destroys logged sets, so it confirms first. */
  const confirmDelete = (w: WorkoutListItem) => {
    Alert.alert(
      'Delete workout?',
      `"${w.name}" and its ${w.total_sets} logged sets will be permanently removed. Personal records are recomputed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Optimistic: the card disappears immediately, then we resync.
            setWorkouts((prev) => prev?.filter((x) => x.id !== w.id) ?? prev);
            try {
              await deleteWorkout(w.id);
            } catch (e) {
              setError(String(e));
            }
            void reload();
          },
        },
      ],
    );
  };

  const loaded = workouts !== null && activity !== null;
  const totalCount = workouts?.length ?? 0;
  const groups = useMemo(() => (workouts ? groupWorkouts(workouts) : []), [workouts]);
  const heatColumns = useMemo(() => (activity ? buildHeatColumns(activity.days) : []), [activity]);

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, headerH ? { paddingTop: headerH } : null]}
      >
        {error && <Text style={styles.error}>{error}</Text>}
        {!loaded && !error && <Text style={styles.loading}>Loading…</Text>}

        {loaded && totalCount === 0 && (
          <EmptyState
            onStart={async () => {
              try {
                const w = await startWorkout({});
                router.push(`/workout/${w.id}`);
              } catch {
                router.navigate('/(tabs)');
              }
            }}
          />
        )}

        {loaded && totalCount > 0 && (
          <View>
            {/* Activity heatmap */}
            <View style={styles.heatCard}>
              <View style={styles.heatHeader}>
                <Text style={styles.heatLabel}>LAST 12 WEEKS</Text>
                <Text style={styles.heatSessions}>{`${activity?.sessions ?? 0} sessions`}</Text>
              </View>
              <View style={styles.heatGrid}>
                {heatColumns.map((cells, colIdx) => (
                  <View key={colIdx} style={styles.heatCol}>
                    {cells.map((intensity, rowIdx) => (
                      <View
                        key={rowIdx}
                        style={[styles.heatCell, { backgroundColor: shadeForIntensity(intensity) }]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>

            {/* Grouped workout list */}
            {groups.map((g) => (
              <View key={g.title} style={styles.group}>
                <Text style={styles.groupTitle}>{g.title}</Text>
                <View style={styles.groupItems}>
                  {g.items.map((w) => (
                    <WorkoutCard
                      key={w.id}
                      workout={w}
                      onPress={() => router.push(`/summary/${w.id}`)}
                      onLongPress={() => confirmDelete(w)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Fixed header overlay */}
      <View
        style={[styles.header, { paddingTop: insets.top + 12 }]}
        onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
      >
        <Text style={styles.title}>History</Text>
        {loaded && (
          <Text style={styles.count}>{`${totalCount} workouts`}</Text>
        )}
      </View>
    </View>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <ClockCenteredIcon size={30} color={color.accent} strokeWidth={2} />
      </View>
      <Text style={styles.emptyTitle}>No workouts yet</Text>
      <Text style={styles.emptySub}>
        Every session you finish lands here — with volume, PRs, and a 12-week activity map.
      </Text>
      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <PlayIcon size={16} color={color.accentFg} strokeWidth={2.6} />
        <Text style={styles.ctaLabel}>Start your first workout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  content: { paddingTop: 108, paddingBottom: 108, paddingHorizontal: 16 },
  loading: { fontFamily: font.bodyRegular, fontSize: 14, color: color.text3, textAlign: 'center' },
  error: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    color: color.error,
    marginTop: 12,
    textAlign: 'center',
  },

  // Fixed header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
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
  count: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },

  // Heatmap card
  heatCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  heatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heatLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.text3,
    textTransform: 'uppercase',
  },
  heatSessions: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  heatGrid: { flexDirection: 'row', gap: 4, justifyContent: 'space-between' },
  heatCol: { flex: 1, flexDirection: 'column', gap: 4 },
  heatCell: { aspectRatio: 1, borderRadius: 3 },

  // Groups
  group: { marginBottom: 22 },
  groupTitle: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  groupItems: { flexDirection: 'column', gap: 10 },

  // Empty state
  empty: { flexDirection: 'column', alignItems: 'center', paddingTop: 80, paddingHorizontal: 16 },
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
    fontSize: 22,
    letterSpacing: -0.44,
    color: color.text1,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: font.bodyRegular,
    fontSize: 14.5,
    color: color.text2,
    lineHeight: 22,
    maxWidth: 260,
    marginTop: 10,
    textAlign: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 26,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: color.accent,
  },
  ctaPressed: { opacity: 0.9 },
  ctaLabel: {
    fontFamily: font.displayBold,
    fontSize: 14.5,
    color: color.accentFg,
  },
});
