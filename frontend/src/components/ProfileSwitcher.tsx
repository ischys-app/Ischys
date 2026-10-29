/**
 * The profile switcher (#117, handoff P2). Mounted once in app/_layout.tsx and
 * opened through `openProfileSwitcher()`.
 *
 * Rows in the manual order (owner first by default), each with its last
 * workout; the current profile has a check. Only the current profile can
 * have a running workout, so its row alone can read `IN WORKOUT · 12:47`,
 * taken from the current file. No accent in this sheet beyond that live dot:
 * picking a profile is a choice, not a primary action.
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { listWorkouts } from '../api/workouts';
import { listProfiles } from '../data/profilesRepo';
import {
  filterProfiles,
  SWITCHER_MAX_FRACTION,
  SWITCHER_SEARCH_FROM,
  switcherListScrolls,
  switcherSubline,
  type ProfileRow,
} from '../domain/profiles';
import { useActiveProfile } from '../lib/activeProfile';
import { haptics } from '../lib/haptics';
import { presentFinishWorkoutFirst } from '../lib/finishWorkoutFirst';
import { closeProfileSwitcher, useProfileSwitcherOpen } from '../lib/profileSwitcherStore';
import { parseServerDate } from '../lib/serverTime';
import { refreshCurrentProfileStats, switchProfile } from '../lib/switchProfile';
import { textScale } from '../theme/textScale';
import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';
import { DraggableSheet } from './DraggableSheet';
import { CheckIcon, HeartFilledIcon, SearchIcon } from './icons';
import { ProfileAvatar } from './ProfileAvatar';

/** DraggableSheet's 220ms exit, and a beat for the modal to go. */
const SHEET_EXIT_MS = 300;

/** When the current profile's running workout began, or null. Read from the current file. */
async function runningSince(): Promise<number | null> {
  const [active] = await listWorkouts({ status: 'active', limit: 1 });
  if (!active) return null;
  const t = parseServerDate(active.started_at);
  return Number.isNaN(t) ? null : t;
}

export function ProfileSwitcher() {
  useThemed();
  const open = useProfileSwitcherOpen();
  const { profile: current } = useActiveProfile();
  const { height: windowHeight } = useWindowDimensions();

  const [rows, setRows] = useState<ProfileRow[] | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [pressedId, setPressedId] = useState<string | null>(null);
  // Whether the rows on screen (after a search) overflow the list: measured,
  // so it holds at any Dynamic Type size. Drives the fade and its rule only.
  const [listH, setListH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const switching = useRef(false);

  // Fresh each time it opens: the current profile's last workout may have
  // just been finished, and the list may have changed in Manage.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setQuery('');
    setPressedId(null);
    setNow(new Date());
    void (async () => {
      try {
        await refreshCurrentProfileStats().catch(() => {});
        const [list, started] = await Promise.all([listProfiles(), runningSince().catch(() => null)]);
        if (!alive) return;
        setRows(list);
        setSince(started);
      } catch (e) {
        if (__DEV__) console.warn('[profiles] switcher failed to load', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  // The running workout's clock ticks while the sheet is up.
  useEffect(() => {
    if (!open || since === null) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [open, since]);

  const all = rows ?? [];
  const hasSearch = all.length >= SWITCHER_SEARCH_FROM;
  // Decided from the whole list, not the search: flipping handleOnly while
  // typing would remount the search field and drop the keyboard.
  const scrolls = switcherListScrolls(all.length, windowHeight);
  const shown = useMemo(() => (hasSearch ? filterProfiles(all, query) : all), [all, hasSearch, query]);
  const overflows = listH > 0 && contentH > listH + 1;

  const onPick = useCallback(
    async (p: ProfileRow) => {
      if (p.id === current.id) {
        closeProfileSwitcher();
        return;
      }
      if (switching.current) return;
      switching.current = true;
      setPressedId(p.id);
      try {
        const result = await switchProfile(p.id);
        if (result === 'ok' || result === 'same') {
          closeProfileSwitcher();
        } else if (result === 'workout') {
          // A workout is running: the P6 sheet replaces this one, once this
          // one has left (two sheets are two modals).
          if (await presentFinishWorkoutFirst(p.id, { delayMs: SHEET_EXIT_MS })) closeProfileSwitcher();
        } else {
          haptics.light();
        }
      } catch (e) {
        // The previous profile is still active; nothing to say beyond staying put.
        if (__DEV__) console.warn('[profiles] switch failed', e);
      } finally {
        switching.current = false;
        setPressedId(null);
      }
    },
    [current.id],
  );

  const go = (to: '/profiles' | '/profiles/new') => {
    closeProfileSwitcher();
    router.push(to);
  };

  return (
    <DraggableSheet
      visible={open}
      onClose={closeProfileSwitcher}
      handleOnly={scrolls}
      sheetStyle={[styles.sheet, { maxHeight: windowHeight * SWITCHER_MAX_FRACTION }]}
    >
      <View>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title} maxFontSizeMultiplier={textScale.display} accessibilityRole="header">
            Switch profile
          </Text>
          <Pressable
            onPress={() => go('/profiles')}
            hitSlop={5}
            style={({ pressed }) => [styles.manage, pressed && styles.pressedDim]}
            accessibilityRole="button"
            accessibilityLabel="Manage profiles"
          >
            <Text style={styles.manageText} maxFontSizeMultiplier={textScale.control}>
              Manage
            </Text>
          </Pressable>
        </View>
      </View>

      {hasSearch && (
        <View style={styles.search}>
          <SearchIcon size={15} color={color.text3} strokeWidth={2.4} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${all.length} profiles`}
            placeholderTextColor={color.text3}
            selectionColor={color.text2}
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            maxFontSizeMultiplier={textScale.control}
            accessibilityLabel="Search profiles"
          />
        </View>
      )}

      <View style={styles.listWrap}>
        <ScrollView
          style={styles.list}
          // Always scrollable: Dynamic Type can make rows taller than the 60pt
          // the estimate assumes, and the bottom rows must stay reachable.
          bounces={false}
          onLayout={(e) => setListH(e.nativeEvent.layout.height)}
          onContentSizeChange={(_, h) => setContentH(h)}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {shown.map((p) => {
            const isCurrent = p.id === current.id;
            const live = isCurrent ? since : null;
            const sub = switcherSubline(p, now, live);
            return (
              <Pressable
                key={p.id}
                onPress={() => void onPick(p)}
                style={({ pressed }) => [styles.row, (pressed || pressedId === p.id) && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: isCurrent }}
                accessibilityLabel={`${p.name}, ${sub}`}
              >
                <ProfileAvatar profile={p} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={textScale.control}>
                    {p.name}
                  </Text>
                  <View style={styles.subRow}>
                    {p.isOwner && <HeartFilledIcon size={11} color={color.text3} />}
                    {live !== null && <View style={styles.liveDot} />}
                    <Text style={styles.sub} numberOfLines={1} maxFontSizeMultiplier={textScale.fixed}>
                      {sub}
                    </Text>
                  </View>
                </View>
                {isCurrent && <CheckIcon size={20} color={color.text1} strokeWidth={2.6} />}
              </Pressable>
            );
          })}
        </ScrollView>
        {overflows && <ListFade />}
      </View>

      <Pressable
        onPress={() => go('/profiles/new')}
        style={({ pressed }) => [styles.addRow, overflows && styles.addRowRule, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel="Add profile"
      >
        <ProfileAvatar profile={{ initials: '' }} size={40} variant="dashed" />
        <Text style={styles.addText} maxFontSizeMultiplier={textScale.control}>
          Add profile
        </Text>
      </Pressable>
    </DraggableSheet>
  );
}

/** The 48pt fade into `surface1` at the foot of a scrolling list. */
function ListFade() {
  useThemed();
  return (
    <View style={styles.fade} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="switcherFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color.surface1} stopOpacity={0} />
            <Stop offset="1" stopColor={color.surface1} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#switcherFade)" />
      </Svg>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: color.border,
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: 34,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.surface3,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
      paddingBottom: 10,
    },
    title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
    manage: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: color.surface2,
      justifyContent: 'center',
    },
    manageText: { fontFamily: font.titleSemi, fontSize: 13, color: color.text1 },
    pressedDim: { opacity: 0.75 },

    search: {
      height: 40,
      borderRadius: 10,
      backgroundColor: color.surface2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      marginBottom: 6,
    },
    searchInput: {
      flex: 1,
      height: 40,
      padding: 0,
      fontFamily: font.bodyRegular,
      fontSize: 14.5,
      color: color.text1,
    },

    listWrap: { flexShrink: 1, minHeight: 0 },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 60,
      paddingHorizontal: 2,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
    },
    rowPressed: { backgroundColor: color.surface2 },
    rowText: { flex: 1, minWidth: 0 },
    name: { fontFamily: font.titleSemi, fontSize: 15.5, letterSpacing: -0.155, color: color.text1 },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.accent },
    sub: {
      flexShrink: 1,
      fontFamily: font.monoRegular,
      fontSize: 11,
      color: color.text3,
      fontVariant: ['tabular-nums'],
    },
    fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 60,
      paddingHorizontal: 2,
    },
    addRowRule: { borderTopWidth: 1, borderTopColor: color.hair },
    addText: { fontFamily: font.bodyMedium, fontSize: 15.5, color: color.text1 },
  }),
);
