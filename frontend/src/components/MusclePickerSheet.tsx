/**
 * Bottom-sheet muscle picker used by the New Exercise form.
 *
 * Handles both selection modes:
 * - `mode="primary"` — single-select; tap to select, tap again to clear.
 * - `mode="secondary"` — multi-select; tap toggles the muscle in/out of the list.
 *
 * The muscle list is fetched once and cached in module scope so both sheets
 * (opened separately) share the network round-trip.
 * Source of truth: export/ischys-app/New Exercise.dc.html.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MuscleOut } from '../api/types';
import { listMuscles } from '../api/workouts';
import { color, font } from '../theme/tokens';
import { CheckIcon, SearchIcon } from './icons';

/** Module-scope cache — shared across both mount lifetimes of the sheet. */
let cachedMuscles: MuscleOut[] | null = null;
let inflight: Promise<MuscleOut[]> | null = null;

/** Load muscles once; subsequent callers get the cached list. */
async function fetchMuscles(): Promise<MuscleOut[]> {
  if (cachedMuscles) return cachedMuscles;
  if (!inflight) {
    inflight = listMuscles()
      .then((m) => {
        cachedMuscles = m;
        return m;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

type Props = {
  visible: boolean;
  mode: 'primary' | 'secondary';
  /** For `primary`: current id (or null). For `secondary`: array of ids. */
  selectedPrimaryId?: string | null;
  selectedSecondaryIds?: string[];
  onSelectPrimary?: (id: string | null) => void;
  onToggleSecondary?: (id: string) => void;
  onClose: () => void;
};

/** Group order — matches the design copy. Falls back to "Other" for unknowns. */
const GROUP_ORDER = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Other'];

export function MusclePickerSheet({
  visible,
  mode,
  selectedPrimaryId = null,
  selectedSecondaryIds = [],
  onSelectPrimary,
  onToggleSecondary,
  onClose,
}: Props) {
  const [muscles, setMuscles] = useState<MuscleOut[]>(cachedMuscles ?? []);
  const [loading, setLoading] = useState(!cachedMuscles);
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (cachedMuscles) {
      setMuscles(cachedMuscles);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMuscles()
      .then((m) => {
        if (!cancelled) {
          setMuscles(m);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset the search each time the sheet re-opens.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? muscles.filter((m) => m.name.toLowerCase().includes(q)) : muscles;
  }, [muscles, query]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, MuscleOut[]>();
    for (const m of filtered) {
      const g = m.group ?? 'Other';
      const arr = byGroup.get(g) ?? [];
      arr.push(m);
      byGroup.set(g, arr);
    }
    // Preserve the design order, then any un-listed groups alphabetically.
    const orderedKeys = [
      ...GROUP_ORDER.filter((g) => byGroup.has(g)),
      ...[...byGroup.keys()]
        .filter((g) => !GROUP_ORDER.includes(g))
        .sort((a, b) => a.localeCompare(b)),
    ];
    return orderedKeys.map((g) => ({ group: g, items: byGroup.get(g) ?? [] }));
  }, [filtered]);

  const title = mode === 'primary' ? 'Primary muscle' : 'Secondary muscles';

  const isSelected = (m: MuscleOut): boolean => {
    if (mode === 'primary') return selectedPrimaryId === m.id;
    return selectedSecondaryIds.includes(m.id);
  };

  const onRowPress = (m: MuscleOut) => {
    if (mode === 'primary') {
      const next = selectedPrimaryId === m.id ? null : m.id;
      onSelectPrimary?.(next);
    } else {
      onToggleSecondary?.(m.id);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <View style={styles.searchIcon} pointerEvents="none">
              <SearchIcon size={15} color={color.text3} strokeWidth={2.2} />
            </View>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search muscles"
              placeholderTextColor={color.text3}
              autoCorrect={false}
              autoCapitalize="none"
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={[
                styles.searchInput,
                searchFocused && { borderColor: color.accent },
              ]}
            />
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={color.text3} />
              </View>
            ) : filtered.length === 0 ? (
              <Text style={styles.empty}>No muscles match "{query.trim()}"</Text>
            ) : (
              grouped.map(({ group, items }) => (
                <View key={group} style={styles.group}>
                  <Text style={styles.groupLabel}>{group.toUpperCase()}</Text>
                  {items.map((m) => {
                    const selected = isSelected(m);
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => onRowPress(m)}
                        style={[styles.row, selected && styles.rowSelected]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={styles.rowName} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {mode === 'primary' ? (
                          <View
                            style={[
                              styles.primaryMark,
                              {
                                borderColor: selected ? color.accent : color.border,
                                backgroundColor: selected ? color.accent : 'transparent',
                              },
                            ]}
                          >
                            {selected ? (
                              <CheckIcon size={13} color={color.accentFg} strokeWidth={3.4} />
                            ) : null}
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.checkbox,
                              {
                                borderColor: selected ? color.accent : color.border,
                                backgroundColor: selected ? color.accent : 'transparent',
                              },
                            ]}
                          >
                            {selected ? (
                              <CheckIcon size={13} color={color.accentFg} strokeWidth={3.4} />
                            ) : null}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.border,
    height: '76%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
  done: { fontFamily: font.titleSemi, fontSize: 15, color: color.accent },

  searchWrap: {
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchIcon: { position: 'absolute', left: 29, zIndex: 1 },
  searchInput: {
    height: 44,
    paddingLeft: 38,
    paddingRight: 14,
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 10,
    color: color.text1,
    fontFamily: font.bodyRegular,
    fontSize: 14.5,
  },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 8, paddingBottom: 24, paddingTop: 4 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: {
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    color: color.text3,
    fontFamily: font.bodyRegular,
    fontSize: 14,
  },

  group: { marginBottom: 8 },
  groupLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.4,
    color: color.text3,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 50,
    height: 50,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 11,
  },
  rowSelected: {
    backgroundColor: 'rgba(255,74,28,0.06)',
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 14.5,
    color: color.text1,
  },
  primaryMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
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
});
