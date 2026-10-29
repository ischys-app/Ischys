/**
 * Manage profiles (P8, #117): every profile in the switcher's order, dragged
 * by the handle to reorder, each opening its detail screen. Unreachable while
 * PROFILES_ENABLED is off.
 * Source of truth: design-handoff/design_handoff_profiles/Profiles.dc.html, P8.
 *
 * Drag works like ReorderExercises: RN's PanResponder on the handle and
 * Animated translations, the other rows shifting toward the drop slot. The new
 * order is written with every id (reorderProfiles needs all of them).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ChevronRightIcon } from '../../src/components/icons';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { listProfiles, reorderProfiles } from '../../src/data/profilesRepo';
import { dropIndex, manageSubline, moveItem, type ProfileRow } from '../../src/domain/profiles';
import { haptics } from '../../src/lib/haptics';
import { refreshCurrentProfileStats } from '../../src/lib/switchProfile';
import { textScale } from '../../src/theme/textScale';
import { color, font, themed } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

const ROW = 64;
const SHIFT_DURATION = 180;

export default function ManageProfilesScreen() {
  useThemed();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);

  // Latest values for the cached PanResponders.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const slotRef = useRef(ROW);
  const origRef = useRef(0);
  const lastToRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      // The active profile's count may be newer than the registry's cache.
      refreshCurrentProfileStats()
        .catch(() => {})
        .then(() => listProfiles())
        .then((list) => {
          if (live) setRows(list);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  const commit = (next: ProfileRow[]) => {
    setRows(next);
    haptics.select();
    reorderProfiles(next.map((p) => p.id)).catch((e) => {
      if (__DEV__) console.warn('[profiles] reorder failed', e);
      listProfiles()
        .then(setRows)
        .catch(() => {});
    });
  };

  // Per-row translateY, keyed by id so it survives reorders.
  const tyRef = useRef(new Map<string, Animated.Value>());
  const ty = (id: string) => {
    let v = tyRef.current.get(id);
    if (!v) {
      v = new Animated.Value(0);
      tyRef.current.set(id, v);
    }
    return v;
  };

  const shift = (dy: number) => {
    const list = rowsRef.current;
    const from = origRef.current;
    const to = dropIndex(from, dy, slotRef.current, list.length);
    if (to === lastToRef.current) return;
    lastToRef.current = to;
    const slot = slotRef.current;
    list.forEach((p, j) => {
      if (j === from) return;
      let by = 0;
      if (to > from && j > from && j <= to) by = -slot;
      else if (to < from && j >= to && j < from) by = slot;
      Animated.timing(ty(p.id), {
        toValue: by,
        duration: SHIFT_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  const release = (dy: number) => {
    const list = rowsRef.current;
    const from = origRef.current;
    const to = dropIndex(from, dy, slotRef.current, list.length);
    list.forEach((p) => ty(p.id).setValue(0));
    if (to !== from) commit(moveItem(list, from, to));
    setDragId(null);
  };

  const respRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const responder = (id: string) => {
    let r = respRef.current.get(id);
    if (!r) {
      r = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          const from = rowsRef.current.findIndex((p) => p.id === id);
          origRef.current = from;
          lastToRef.current = from;
          ty(id).setValue(0);
          setDragId(id);
          haptics.light();
        },
        onPanResponderMove: (_e, g) => {
          ty(id).setValue(g.dy);
          shift(g.dy);
        },
        onPanResponderRelease: (_e, g) => release(g.dy),
        onPanResponderTerminate: (_e, g) => release(g.dy),
      });
      respRef.current.set(id, r);
    }
    return r;
  };

  // VoiceOver and TalkBack can't drag: each row offers Move up / Move down.
  const onA11yAction = (index: number) => (e: AccessibilityActionEvent) => {
    const to = e.nativeEvent.actionName === 'moveUp' ? index - 1 : index + 1;
    if (to < 0 || to >= rows.length) return;
    commit(moveItem(rows, index, to));
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: 116 + insets.top, paddingBottom: 40 + insets.bottom }]}
        scrollEnabled={dragId === null}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {rows.map((p, i) => {
            const dragged = p.id === dragId;
            return (
              <Animated.View
                key={p.id}
                onLayout={i === 0 ? (e) => (slotRef.current = e.nativeEvent.layout.height) : undefined}
                style={[
                  styles.rowWrap,
                  { zIndex: dragged ? 10 : 1, transform: [{ translateY: ty(p.id) }] },
                  dragged && styles.rowDragged,
                ]}
              >
                <View style={styles.row}>
                  <View
                    style={styles.handle}
                    {...responder(p.id).panHandlers}
                    accessible
                    accessibilityLabel={`Reorder ${p.name}`}
                    accessibilityHint="Drag up or down"
                    accessibilityActions={[
                      { name: 'moveUp', label: 'Move up' },
                      { name: 'moveDown', label: 'Move down' },
                    ]}
                    onAccessibilityAction={onA11yAction(i)}
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path d="M5 9h14M5 15h14" stroke={color.text3} strokeWidth={2.2} strokeLinecap="round" />
                    </Svg>
                  </View>
                  <Pressable
                    onPress={() => router.push({ pathname: '/profiles/[id]', params: { id: p.id } })}
                    disabled={dragId !== null}
                    style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name}, ${manageSubline(p).toLowerCase()}`}
                  >
                    <ProfileAvatar profile={p} size={40} />
                    <View style={styles.texts}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.sub} numberOfLines={1} maxFontSizeMultiplier={textScale.fixed}>
                        {manageSubline(p)}
                      </Text>
                    </View>
                    <ChevronRightIcon size={15} color={color.text3} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </Animated.View>
            );
          })}
          <Pressable
            onPress={() => router.push('/profiles/new')}
            style={({ pressed }) => [styles.addRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Add profile"
          >
            <ProfileAvatar profile={{ initials: '' }} size={40} variant="dashed" />
            <Text style={styles.addText} maxFontSizeMultiplier={textScale.control}>
              Add profile
            </Text>
          </Pressable>
        </View>
        <Text style={styles.footer}>Drag to reorder. The switcher shows profiles in this order.</Text>
      </ScrollView>

      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Svg width={9} height={15} viewBox="0 0 9 15" fill="none">
            <Path d="M7 2L2 7.5 7 13" stroke={color.text2} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.title} maxFontSizeMultiplier={textScale.control} accessibilityRole="header">
          Profiles
        </Text>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: color.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: color.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
    pressed: { opacity: 0.7 },

    content: { paddingHorizontal: 16 },
    card: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 16,
      overflow: 'hidden',
    },
    rowWrap: { backgroundColor: color.surface1 },
    rowDragged: {
      backgroundColor: color.surface2,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.35,
      shadowRadius: 14,
      elevation: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: ROW,
      paddingRight: 14,
      paddingLeft: 6,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
    },
    handle: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', minWidth: 0 },
    texts: { flex: 1, minWidth: 0 },
    name: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },
    sub: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      color: color.text3,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 60,
      paddingRight: 14,
      paddingLeft: 42,
    },
    addText: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text1 },
    footer: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text3,
      paddingTop: 8,
      paddingHorizontal: 2,
    },
  }),
);
