/**
 * Exercise Library — modal picker with search, category filter, alphabetical
 * groups, multi-select and a floating "Add N" CTA. Presented modally from the
 * Active Workout screen's "+ Add Exercise" button (or from the routine builder).
 * Source-of-truth: export/ischys-app/Exercise Library.dc.html.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CategoryOut, ExerciseOut } from '../src/api/types';
import {
  addWorkoutExercise,
  listCategories,
  listExercises,
} from '../src/api/workouts';
import { CheckIcon, ChevronRightIcon, PlusIcon, SearchIcon } from '../src/components/icons';
import { setPendingSelection } from '../src/lib/pendingSelection';
import { ExerciseAvatar } from '../src/components/ExerciseAvatar';
import { mediaUrl } from '../src/lib/media';
import { color, font } from '../src/theme/tokens';

const ALL = 'All';
const DEFAULT_REST_SECONDS = 120;

type Group = { letter: string; items: ExerciseOut[] };

/** Group exercises alphabetically by first-letter of `name`. */
function groupByLetter(items: ExerciseOut[]): Group[] {
  const byLetter = new Map<string, ExerciseOut[]>();
  for (const ex of items) {
    const L = (ex.name[0] ?? '#').toUpperCase();
    const arr = byLetter.get(L) ?? [];
    arr.push(ex);
    byLetter.set(L, arr);
  }
  return [...byLetter.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, items]) => ({ letter, items }));
}

export default function ExerciseLibrary() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ workoutId?: string; pick?: string; browse?: string }>();
  const workoutId = Array.isArray(params.workoutId) ? params.workoutId[0] : params.workoutId;
  const pickParam = Array.isArray(params.pick) ? params.pick[0] : params.pick;
  const browseParam = Array.isArray(params.browse) ? params.browse[0] : params.browse;
  // Browse: opened from Home's "Explore" to look around; tapping opens detail.
  const browseMode = browseParam === '1';
  // Return-selection mode: either an explicit ?pick=1, or no workout context at all.
  const pickMode = !browseMode && (pickParam === '1' || !workoutId);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [exercises, setExercises] = useState<ExerciseOut[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Debounce search input by 300ms so we don't re-run the local query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Initial parallel fetch of categories + exercises.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats] = await Promise.all([listCategories()]);
        if (cancelled) return;
        setCategories(cats);
      } catch {
        // Non-fatal — the "All" chip still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch exercises on mount, search change, and category change.
  const fetchExercises = useCallback(async (signal: { cancelled: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listExercises({
        search: debouncedQuery || undefined,
        category: filter !== ALL ? filter : undefined,
      });
      if (signal.cancelled) return;
      setExercises(list);
    } catch (e) {
      if (signal.cancelled) return;
      // Keep whatever list we already have — a transient failure (e.g. the DB
      // briefly unavailable right after unlock) must not blank a populated list.
      setError(e instanceof Error ? e.message : 'Failed to load exercises');
    } finally {
      if (!signal.cancelled) setLoading(false);
    }
  }, [debouncedQuery, filter]);

  // Refetch on focus AND on debounced query / filter changes. `useFocusEffect`
  // covers the initial mount too, so no separate `useEffect` is needed
  // (avoids a duplicate exercises query on first render).
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      fetchExercises(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [fetchExercises]),
  );

  // `useFocusEffect` fires on navigation focus, not when the app returns from the
  // background — so unlocking the phone (or app-switching back) while this screen
  // is already open would leave a list that failed to load blank. Reload on
  // foreground too.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void fetchExercises({ cancelled: false });
    });
    return () => sub.remove();
  }, [fetchExercises]);

  const groups = useMemo(() => groupByLetter(exercises), [exercises]);
  const selCount = selected.size;
  const isEmpty = !loading && exercises.length === 0;
  // `loading` alone only covers the in-flight fetch; the 300ms debounce before it
  // left the field looking inert while typing.
  const searching = loading || query.trim() !== debouncedQuery;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addingRef = useRef(false);
  const handleAdd = async () => {
    if (addingRef.current) return;
    if (selCount === 0) {
      router.back();
      return;
    }
    if (pickMode) {
      // Return the selected ExerciseOut list to whoever opened us (e.g. routine builder).
      const chosen: ExerciseOut[] = [];
      for (const id of selected) {
        const ex = exercises.find((e) => e.id === id);
        if (ex) chosen.push(ex);
      }
      setPendingSelection(chosen);
      router.back();
      return;
    }
    if (!workoutId) {
      router.back();
      return;
    }
    addingRef.current = true;
    setAdding(true);
    try {
      // Sequential POSTs — server assigns position in order.
      for (const id of selected) {
        await addWorkoutExercise(workoutId, {
          exercise_id: id,
          rest_seconds: DEFAULT_REST_SECONDS,
        });
      }
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add exercises');
      addingRef.current = false;
      setAdding(false);
    }
  };

  // Chip list: prepend "All" to the fetched categories.
  const chipLabels = useMemo(() => [ALL, ...categories.map((c) => c.name)], [categories]);

  const headerBottom = 158; // px reserved for the absolute header (matches HTML).
  const ctaHeight = 52;
  const scrollBottomPad = ctaHeight + 24 + insets.bottom + 24;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          presentation: 'modal',
          headerShown: false,
          animation: 'slide_from_bottom',
          contentStyle: { backgroundColor: color.bg },
        }}
      />

      {/* Scrollable list — sits under the absolutely-positioned header. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: headerBottom + insets.top,
          paddingHorizontal: 12,
          paddingBottom: scrollBottomPad,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading && exercises.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={color.text3} />
          </View>
        ) : null}

        {groups.map((g) => (
          <View key={g.letter} style={styles.group}>
            <Text style={styles.groupLabel}>{g.letter}</Text>
            <View style={styles.groupItems}>
              {g.items.map((ex) => {
                const sel = selected.has(ex.id);
                return (
                  <ExerciseRow
                    key={ex.id}
                    exercise={ex}
                    selected={sel}
                    selectable={!browseMode}
                    onToggle={() => toggle(ex.id)}
                  />
                );
              })}
            </View>
          </View>
        ))}

        {isEmpty ? (
          <Text style={styles.empty}>
            {debouncedQuery
              ? `No exercises match "${debouncedQuery}"`
              : 'No exercises found'}
          </Text>
        ) : null}
      </ScrollView>

      {/* HEADER (absolute, blurred). */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Add Exercise</Text>
          <Pressable
            onPress={() => router.push('/exercise/new')}
            hitSlop={8}
            style={styles.newRow}
          >
            <PlusIcon size={15} color={color.accent} strokeWidth={2.4} />
            <Text style={styles.new}>New</Text>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchIcon} pointerEvents="none">
            <SearchIcon size={16} color={color.text3} strokeWidth={2.2} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search exercises"
            placeholderTextColor={color.text3}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            style={[
              styles.searchInput,
              searchFocused && { borderColor: color.accent },
            ]}
          />
          {searching && query.length > 0 && (
            <View style={styles.searchSpinner} pointerEvents="none">
              <ActivityIndicator size="small" color={color.text3} />
            </View>
          )}
        </View>

        {error ? <Text style={styles.errorLine}>{error}</Text> : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {chipLabels.map((label) => {
            const active = filter === label;
            return (
              <Pressable
                key={label}
                onPress={() => setFilter(label)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Floating "Add N" CTA. */}
      {selCount > 0 ? (
        <View
          pointerEvents="box-none"
          style={[styles.ctaWrap, { bottom: 24 + insets.bottom }]}
        >
          <Pressable
            onPress={handleAdd}
            disabled={adding}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.9 },
              adding && { opacity: 0.7 },
            ]}
          >
            {adding ? (
              <ActivityIndicator color={color.accentFg} />
            ) : (
              <Text style={styles.ctaText}>
                {`Add ${selCount} ${selCount === 1 ? 'exercise' : 'exercises'}`}
              </Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Row: 44dp initials avatar, name + meta, and a 44×44 checkbox tap target.
 *
 * Browsing (`selectable={false}`) has nothing to select — the row just opens the
 * exercise. It shows a chevron rather than a checkbox that would either lie or,
 * as it once did, quietly navigate instead of ticking.
 */
function ExerciseRow({
  exercise,
  selected,
  selectable,
  onToggle,
}: {
  exercise: ExerciseOut;
  selected: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const category = exercise.category?.name;
  const meta = category ? `${exercise.equipment} · ${category}` : exercise.equipment;

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: selected ? 'rgba(255,74,28,0.07)' : 'transparent' },
      ]}
    >
      <Pressable
        style={styles.rowLeft}
        onPress={() => {
          router.push(`/exercise/${exercise.id}`);
        }}
      >
        <ExerciseAvatar
          imageUrl={mediaUrl(exercise.image_url)}
          initials={exercise.initials}
          style={
            selected
              ? {
                  backgroundColor: 'rgba(255,74,28,0.14)',
                  borderWidth: 1,
                  borderColor: 'rgba(255,74,28,0.4)',
                }
              : undefined
          }
        />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {exercise.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>

      {selectable ? (
        <Pressable style={styles.checkboxHit} onPress={onToggle} hitSlop={4}>
          <View
            style={[
              styles.checkbox,
              {
                borderColor: selected ? color.accent : color.border,
                backgroundColor: selected ? color.accent : 'transparent',
              },
            ]}
          >
            {selected ? <CheckIcon size={13} color={color.accentFg} strokeWidth={3.4} /> : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          style={styles.checkboxHit}
          onPress={() => router.push(`/exercise/${exercise.id}`)}
          hitSlop={4}
        >
          <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  loading: { paddingTop: 40, alignItems: 'center' },
  searchSpinner: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
    // topPadding handled inline (54 + insets.top - 44 baseline).
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  cancel: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.text2,
  },
  title: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    letterSpacing: -0.16,
    color: color.text1,
  },
  newRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  new: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.accent,
  },

  // Search ------------------------------------------------------------
  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 12,
  },
  searchIcon: {
    position: 'absolute',
    left: 13,
    zIndex: 1,
  },
  searchInput: {
    height: 44,
    paddingLeft: 40,
    paddingRight: 14,
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 11,
    color: color.text1,
    fontFamily: font.bodyRegular,
    fontSize: 15,
    // RN inputs use padding for the text baseline.
    paddingTop: Platform.OS === 'ios' ? 0 : 6,
    paddingBottom: Platform.OS === 'ios' ? 0 : 6,
  },

  errorLine: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.error,
    marginBottom: 8,
  },

  // Chips -------------------------------------------------------------
  chipsContent: {
    gap: 8,
    paddingBottom: 2,
    paddingRight: 4,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(255,74,28,0.12)',
    borderColor: color.accent,
  },
  chipInactive: {
    backgroundColor: color.surface2,
    borderColor: color.border,
  },
  chipText: {
    fontFamily: font.monoMedium,
    fontSize: 12,
  },
  chipTextActive: { color: color.accent },
  chipTextInactive: { color: color.text2 },

  // Groups ------------------------------------------------------------
  group: { marginBottom: 8 },
  groupLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    paddingTop: 12,
    paddingHorizontal: 6,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  groupItems: { gap: 2 },

  // Row ---------------------------------------------------------------
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
    paddingRight: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    borderRadius: 12,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.monoSemi,
    fontSize: 14,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    letterSpacing: -0.145,
    color: color.text1,
  },
  rowMeta: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 2,
  },

  // Checkbox ----------------------------------------------------------
  checkboxHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state -------------------------------------------------------
  empty: {
    textAlign: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    color: color.text3,
    fontFamily: font.bodyRegular,
    fontSize: 14,
  },

  // Floating CTA ------------------------------------------------------
  ctaWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 30,
  },
  cta: {
    height: 52,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: color.accent,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 14 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  ctaText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
});
