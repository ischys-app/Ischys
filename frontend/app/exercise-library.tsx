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
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CategoryOut, ExerciseOut } from '../src/api/types';
import {
  addWorkoutExercises,
  listCategories,
  listExerciseUsage,
  listExercises,
} from '../src/api/workouts';
import { ChevronRightIcon, InfoIcon, PlusIcon, SearchIcon } from '../src/components/icons';
import { setPendingSelection } from '../src/lib/pendingSelection';
import { ExerciseAvatar } from '../src/components/ExerciseAvatar';
import { PressableScale } from '../src/components/PressableScale';
import { SelectCircle } from '../src/components/ui';
import { mediaUrl } from '../src/lib/media';
import { rankByUsage } from '../src/domain/exerciseRanking';
import { registerPicker } from '../src/lib/exercisePicker';
import { accentA, color, font } from '../src/theme/tokens';

const ALL = 'All';
const DEFAULT_REST_SECONDS = 120;

/** Merge glyph: two overlapping circles (icons.tsx is owned by another stream). */
function MergeGlyph({ size = 16, color: stroke }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={8} r={5} stroke={stroke} strokeWidth={2} fill="none" />
      <Circle cx={16} cy={16} r={5} stroke={stroke} strokeWidth={2} fill="none" />
    </Svg>
  );
}

type Group = { letter: string; items: ExerciseOut[] };

/** How many trained lifts the shortcut section shows before it stops being one. */
const TOP_LIFTS = 12;

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
  const [usage, setUsage] = useState<Map<string, { sessions: number; lastAt: number }>>(new Map());
  // Keyed by exercise id, holding the whole `ExerciseOut`. Storing the objects
  // (not just ids) is what lets a pick made under an earlier search survive:
  // `exercises` is the *filtered* result set, so a later query drops the row a
  // selection was made from and an id-only set could no longer resolve it.
  // Insertion order is the add order.
  const [selected, setSelected] = useState<Map<string, ExerciseOut>>(new Map());
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

  // Sections: the lifts this user actually trains, then the whole catalog A-Z.
  // The alphabet keeps every exercise, including the ranked ones — "I know it
  // starts with B" is still how you find something you've never done.
  const sections = useMemo(() => {
    const letters = groupByLetter(exercises).map((g) => ({ title: g.letter, data: g.items }));
    // Only when browsing everything. Under a search or a category filter the
    // user has already said what they want, and a shortcut would just repeat it.
    if (debouncedQuery || filter !== ALL) return letters;
    const top = rankByUsage(exercises, usage, { now: Date.now(), limit: TOP_LIFTS });
    return top.length > 0 ? [{ title: 'YOUR LIFTS', data: top }, ...letters] : letters;
  }, [exercises, usage, debouncedQuery, filter]);
  const selCount = selected.size;
  const isEmpty = !loading && exercises.length === 0;
  // `loading` alone only covers the in-flight fetch; the 300ms debounce before it
  // left the field looking inert while typing.
  const searching = loading || query.trim() !== debouncedQuery;

  // Usage is a property of the user's history, not of the current query, so it
  // is loaded once rather than refetched on every keystroke.
  useEffect(() => {
    let alive = true;
    void listExerciseUsage()
      .then((u) => {
        if (alive) setUsage(u);
      })
      .catch(() => {
        // No history is a fine answer: the section just doesn't appear.
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback((ex: ExerciseOut) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(ex.id)) next.delete(ex.id);
      else next.set(ex.id, ex);
      return next;
    });
  }, []);

  // Let the Exercise Detail screen act on THIS selection while it's pushed on
  // top, rather than keeping a second copy that would disagree the moment
  // either side changed. Browse mode registers nothing: there's nothing to add
  // to, so detail shows no bar.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    if (browseMode) return;
    return registerPicker({
      isSelected: (id) => selectedRef.current.has(id),
      toggle,
    });
  }, [browseMode, toggle]);

  const addingRef = useRef(false);
  const handleAdd = async (asSuperset = false) => {
    if (addingRef.current) return;
    if (selCount === 0) {
      router.back();
      return;
    }
    if (pickMode) {
      // Return the selected ExerciseOut list to whoever opened us (e.g. routine builder).
      setPendingSelection([...selected.values()]);
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
      // One write for the lot, positions assigned in order, and paired in the
      // same step, so "Add as superset" lands as one action rather than making
      // the user group them again on the next screen. All or nothing: a
      // failure leaves the selection to be retried without adding any twice.
      await addWorkoutExercises(
        workoutId,
        [...selected.keys()].map((id) => ({ exercise_id: id, rest_seconds: DEFAULT_REST_SECONDS })),
        { asSuperset },
      );
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

      {/* Virtualized list — sits under the absolutely-positioned header.

          A SectionList, not a ScrollView: the catalog is ~700 exercises and a
          ScrollView mounted every one of them up front, each with an avatar that
          for the illustrated ones is a full inline SVG. That was the slow first
          paint. Only the visible rows mount now; the rest arrive as you scroll. */}
      <SectionList
        style={styles.scroll}
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: headerBottom + insets.top,
          paddingHorizontal: 12,
          paddingBottom: scrollBottomPad,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // The catalog is static while a query stands, so a row only re-renders
        // when its own selection changes.
        renderItem={({ item }) => (
          <ExerciseRow
            exercise={item}
            selected={selected.has(item.id)}
            selectable={!browseMode}
            onToggle={() => toggle(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.groupLabel}>{section.title}</Text>
        )}
        ListHeaderComponent={
          loading && exercises.length === 0 ? (
            <View style={styles.loading}>
              <ActivityIndicator color={color.text3} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          isEmpty ? (
            <Text style={styles.empty}>
              {debouncedQuery
                ? `No exercises match "${debouncedQuery}"`
                : 'No exercises found'}
            </Text>
          ) : null
        }
      />

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
            accessibilityLabel="Search exercises"
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

      {/* Floating CTA — Add N, plus a Merge affordance when 2+ are picked. */}
      {selCount > 0 ? (
        <View
          pointerEvents="box-none"
          style={[styles.ctaWrap, { bottom: 24 + insets.bottom }]}
        >
          {selCount >= 2 ? (
            <PressableScale
              onPress={() => {
                const ids = [...selected.keys()].join(',');
                router.push(`/merge-duplicates?ids=${ids}`);
              }}
              style={styles.mergeCta}
            >
              <MergeGlyph size={16} color={color.text1} />
              <Text style={styles.mergeCtaText}>{`Merge ${selCount}`}</Text>
            </PressableScale>
          ) : null}
          {/* Only with a partner to pair with, and only when adding to a
              workout — a routine picker has nothing to group into yet. */}
          {selCount >= 2 && workoutId && !pickMode ? (
            <PressableScale
              onPress={() => void handleAdd(true)}
              disabled={adding}
              style={styles.mergeCta}
            >
              <Text style={styles.mergeCtaText}>Add as superset</Text>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={() => void handleAdd(false)}
            disabled={adding}
            style={[styles.cta, adding && { opacity: 0.7 }]}
          >
            {adding ? (
              <ActivityIndicator color={color.accentFg} />
            ) : (
              <Text style={styles.ctaText}>
                {`Add ${selCount} ${selCount === 1 ? 'exercise' : 'exercises'}`}
              </Text>
            )}
          </PressableScale>
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

  const openDetail = () =>
    router.push(
      // Detail needs to know it was opened from the picker, so it can offer to
      // select rather than just describe.
      selectable ? `/exercise/${exercise.id}?pick=1` : `/exercise/${exercise.id}`,
    );

  return (
    // The whole row selects. It used to open details, with only the 44pt
    // checkbox selecting — and people tapped the name expecting it to select,
    // which is the more common intent on a screen called Add Exercise.
    <Pressable
      onPress={selectable ? onToggle : openDetail}
      style={[
        styles.row,
        { backgroundColor: selected ? accentA(0.07) : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      accessibilityLabel={exercise.name}
      accessibilityHint={selectable ? 'Selects this exercise' : 'Opens exercise details'}
    >
      {/* A selection circle up front, so a row reads as selectable before it is
          tapped. Without it, whole-row tapping isn't discoverable. */}
      {selectable ? <SelectCircle selected={selected} /> : null}

      <ExerciseAvatar
        imageUrl={mediaUrl(exercise.image_url)}
        initials={exercise.initials}
        exerciseId={exercise.id}
        style={
          selected
            ? {
                backgroundColor: accentA(0.14),
                borderWidth: 1,
                borderColor: accentA(0.4),
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

      {/* Details move to their own button, which swallows the press so opening
          them never also toggles the row underneath. Only while selecting: when
          browsing, the row itself already opens details and a second control
          doing the same thing would say nothing, so the chevron stays. */}
      {selectable ? (
        <Pressable
          style={styles.infoHit}
          onPress={(e) => {
            e.stopPropagation();
            openDetail();
          }}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`About ${exercise.name}`}
        >
          {({ pressed }) => (
            <InfoIcon size={20} color={pressed ? color.text1 : color.text3} strokeWidth={2} />
          )}
        </Pressable>
      ) : (
        <View style={styles.infoHit}>
          <ChevronRightIcon size={14} color={color.text3} strokeWidth={2.4} />
        </View>
      )}
    </Pressable>
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
    backgroundColor: accentA(0.12),
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
  rowGap: { height: 2 },

  // Row ---------------------------------------------------------------
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // The row lays out circle / avatar / text / info directly now that the
    // inner container (which carried its own gap) is gone.
    gap: 10,
    paddingTop: 4,
    paddingRight: 4,
    paddingBottom: 4,
    paddingLeft: 8,
    borderRadius: 12,
  },
  // Full thumb target for the details affordance, matching the checkbox it
  // replaces in the same slot.
  infoHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: 10,
  },
  mergeCta: {
    height: 44,
    borderRadius: 12,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mergeCtaText: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
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
