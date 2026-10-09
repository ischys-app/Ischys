import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ActivityDay, ActivityMapOut, WorkoutListItem } from '../../src/api/types';
import { countWorkouts, deleteWorkout, getActivityMap, listWorkouts } from '../../src/api/workouts';
import { beginWorkout } from '../../src/lib/startWorkoutFlow';
import { ClockCenteredIcon, PlayIcon } from '../../src/components/icons';
import { WorkoutCard } from '../../src/components/WorkoutCard';
import {
  addDays,
  daysBetween,
  fmtHistoryGroupTitle,
  parseIso,
  startOfDay,
  startOfIsoWeek,
} from '../../src/lib/format';
import { haptics } from '../../src/lib/haptics';
import {
  appendPage,
  hasMorePages,
  HISTORY_PAGE_SIZE,
  refreshLimit,
} from '../../src/lib/historyPaging';
import { accentA, color, font } from '../../src/theme/tokens';

const HEAT_WEEKS = 12;
const HEAT_DAYS = HEAT_WEEKS * 7; // 84
/** Rows per query when the list is re-read on focus. */
const RELOAD_CHUNK = 500;

/** Shade for a heat-map cell given its 0..3 intensity. */
function shadeForIntensity(i: number): string {
  if (i >= 3) return color.accent;
  if (i === 2) return accentA(0.62);
  if (i === 1) return accentA(0.35);
  return color.surface3;
}

type HistorySection = { title: string; data: WorkoutListItem[] };

/** Bucket workouts into ordered groups by their group title (THIS/LAST WEEK, else month). */
function groupWorkouts(workouts: WorkoutListItem[]): HistorySection[] {
  const now = new Date();
  const groups: HistorySection[] = [];
  const byTitle = new Map<string, WorkoutListItem[]>();
  for (const w of workouts) {
    const title = fmtHistoryGroupTitle(w.started_at, now);
    let bucket = byTitle.get(title);
    if (!bucket) {
      bucket = [];
      byTitle.set(title, bucket);
      groups.push({ title, data: bucket });
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
    const diff = daysBetween(firstMon, dt);
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
  // Every completed workout, not just the ones read so far: the header's count.
  const [total, setTotal] = useState(0);
  const [activity, setActivity] = useState<ActivityMapOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The list is read a page at a time as it is scrolled (historyPaging.ts).
  // `shown` is how many rows are held, for the reads that happen outside a
  // render; `reading` keeps two reads from overlapping.
  const shown = useRef(0);
  const reading = useRef(false);

  // Re-reads as much as was showing, so the list keeps its length under a
  // scroll position. In chunks: one query for a few thousand rows would bind
  // more values than SQLite allows.
  const reload = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    try {
      const want = refreshLimit(shown.current);
      const [count, a] = await Promise.all([countWorkouts('completed'), getActivityMap(HEAT_WEEKS)]);
      let rows: WorkoutListItem[] = [];
      for (let offset = 0; offset < want; offset += RELOAD_CHUNK) {
        const chunk = await listWorkouts({
          status: 'completed',
          limit: Math.min(RELOAD_CHUNK, want - offset),
          offset,
        });
        rows = appendPage(rows, chunk);
        if (chunk.length < RELOAD_CHUNK) break;
      }
      shown.current = rows.length;
      setWorkouts(rows);
      setTotal(count);
      setActivity(a);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      reading.current = false;
    }
  }, []);

  /** The next page down, when the end of what is held scrolls into reach. */
  const loadMore = useCallback(async () => {
    if (reading.current || !hasMorePages(shown.current, total)) return;
    reading.current = true;
    try {
      const page = await listWorkouts({
        status: 'completed',
        limit: HISTORY_PAGE_SIZE,
        offset: shown.current,
      });
      setWorkouts((prev) => {
        const next = appendPage(prev ?? [], page);
        shown.current = next.length;
        return next;
      });
      // Nothing came back: the count was ahead of the table. Stop asking.
      if (page.length === 0) setTotal(shown.current);
    } catch (e) {
      setError(String(e));
    } finally {
      reading.current = false;
    }
  }, [total]);

  // On focus, not just on mount: a workout finished or deleted elsewhere must be
  // reflected when we come back to this tab.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /** Delete, from a card's menu. Destroys logged sets, so it confirms first. */
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
            setWorkouts((prev) => {
              const next = prev?.filter((x) => x.id !== w.id) ?? prev;
              if (next) shown.current = next.length;
              return next;
            });
            setTotal((n) => Math.max(0, n - 1));
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
  const totalCount = total;
  const sections = useMemo(() => (workouts ? groupWorkouts(workouts) : []), [workouts]);
  const heatColumns = useMemo(() => (activity ? buildHeatColumns(activity.days) : []), [activity]);

  return (
    <View style={styles.root}>
      {/* A virtualised list: only the cards near the screen are mounted, so a
          history of thousands scrolls like one of ten. The heatmap rides at
          the top as its header and the groups are its sections. */}
      <SectionList
        sections={loaded && totalCount > 0 ? sections : []}
        keyExtractor={(w) => w.id}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.content, headerH ? { paddingTop: headerH } : null]}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={1.5}
        initialNumToRender={8}
        windowSize={9}
        ListHeaderComponent={
          <>
            {error && <Text style={styles.error}>{error}</Text>}
            {!loaded && !error && <Text style={styles.loading}>Loading…</Text>}

            {loaded && totalCount === 0 && (
              <EmptyState
                onStart={async () => {
                  try {
                    const begun = await beginWorkout({});
                    if (begun) router.push(`/workout/${begun.workoutId}`);
                  } catch {
                    router.navigate('/(tabs)');
                  }
                }}
              />
            )}

            {loaded && totalCount > 0 && (
              // Activity heatmap
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
            )}
          </>
        }
        renderSectionHeader={({ section }) => <Text style={styles.groupTitle}>{section.title}</Text>}
        // The space under a group's last card, before the next group's title.
        renderSectionFooter={() => <View style={styles.groupEnd} />}
        ItemSeparatorComponent={ItemGap}
        renderItem={({ item: w }) =>
          Platform.OS === 'ios' ? (
            // Long-press opens the system context menu (13a, E1).
            // The row is a Link so the menu is expo-router's own —
            // no extra native dependency — and a tap still goes to
            // the Summary, as before. Delete keeps its place here:
            // long-press used to mean only that.
            // The wrapping View keeps the list's gap per row: the
            // Link renders its menu as a second, empty sibling, which
            // otherwise took a gap of its own under every card.
            <View>
              <Link href={`/summary/${w.id}`} asChild>
                <Link.Trigger>
                  <WorkoutCard workout={w} accessibilityHint="Long-press for more actions." />
                </Link.Trigger>
                <Link.Menu>
                  <Link.MenuAction
                    icon="pencil"
                    onPress={() => router.push(`/workout/edit/${w.id}?from=history`)}
                  >
                    Edit workout
                  </Link.MenuAction>
                  <Link.MenuAction icon="trash" destructive onPress={() => confirmDelete(w)}>
                    Delete workout
                  </Link.MenuAction>
                </Link.Menu>
              </Link>
            </View>
          ) : (
            // The context menu is iOS-only; elsewhere long-press
            // keeps doing what it did. Editing is on the Summary.
            <WorkoutCard
              workout={w}
              onPress={() => router.push(`/summary/${w.id}`)}
              onLongPress={() => {
                haptics.longPress(); // the menu's own tap, on iOS
                confirmDelete(w);
              }}
            />
          )
        }
      />

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

/** The gap between two cards of a group. */
function ItemGap() {
  return <View style={styles.itemGap} />;
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
  groupEnd: { height: 22 },
  groupTitle: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  itemGap: { height: 10 },

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
