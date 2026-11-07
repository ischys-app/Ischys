/**
 * Full-screen reorder list with drag-to-reorder, shared by the exercise
 * reorder overlay (workout + edit-workout screens) and the routine reorder
 * screen. Built from the Active Workout design (section B) + drag logic
 * (sections C/D). Drag starts on the grip only; rows shift with a 180ms ease,
 * the dragged row follows the finger with no animation. Uses RN's built-in
 * PanResponder + Animated — no gesture-handler / reanimated. The index math
 * is in domain/reorder.ts (tested there).
 */
import { t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import {
  type AccessibilityActionEvent,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { dropIndex, moveItem, shiftFor, stepIndex } from '../domain/reorder';
import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';

const ROW_SLOT = 70; // row height (60) + marginBottom (10)
const SHIFT_DURATION = 180;

/** What one row shows: an initials avatar, a title and an optional subtitle. */
export type ReorderRow = { initials: string; title: string; subtitle?: string };

/**
 * Screen-reader Move up / Move down on each grip, for people who can't drag.
 * Left out, the grip is a plain drag target as before.
 */
export type ReorderMoveActions = {
  /** Label of a row's grip, e.g. "Reorder Push day". */
  label: (row: ReorderRow) => string;
  hint: string;
  moveUp: string;
  moveDown: string;
};

type Props<T extends { id: string }> = {
  visible: boolean;
  items: readonly T[];
  /** How an item is drawn. */
  row: (item: T) => ReorderRow;
  title: string;
  topInset: number;
  onDone: () => void;
  /** Called once per completed move, with the reordered array. */
  onReorder: (nextOrder: T[]) => void;
  moveActions?: ReorderMoveActions;
};

export function ReorderList<T extends { id: string }>({
  visible,
  items: source,
  row,
  title,
  topInset,
  onDone,
  onReorder,
  moveActions,
}: Props<T>) {
  useThemed();
  const [items, setItems] = useState<readonly T[]>(source);
  const [dragId, setDragId] = useState<string | null>(null);

  // Latest values read from within the cached PanResponders.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const origIndexRef = useRef(0);
  const lastToRef = useRef(0);

  // Per-item translateY, keyed by id so it survives reorders.
  const tyRef = useRef(new Map<string, Animated.Value>());
  const getTy = (id: string) => {
    let v = tyRef.current.get(id);
    if (!v) {
      v = new Animated.Value(0);
      tyRef.current.set(id, v);
    }
    return v;
  };

  // Re-sync from the parent when it changes the list (add/remove), but never
  // mid-drag — the splice is committed locally on release.
  useEffect(() => {
    if (dragId == null) setItems(source);
  }, [source, dragId]);

  // Shift the non-dragged rows toward the drop target (animated), leaving the
  // dragged row to follow the finger directly.
  const applyShifts = (dy: number) => {
    const arr = itemsRef.current;
    const orig = origIndexRef.current;
    const to = dropIndex(orig, dy, ROW_SLOT, arr.length);
    if (to === lastToRef.current) return; // target unchanged — keep animations running
    lastToRef.current = to;
    arr.forEach((e, j) => {
      if (j === orig) return; // the dragged row is driven directly
      Animated.timing(getTy(e.id), {
        toValue: shiftFor(j, orig, to, ROW_SLOT),
        duration: SHIFT_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  const commit = (next: T[]) => {
    setItems(next);
    onReorderRef.current(next);
  };

  const release = (dy: number) => {
    const arr = itemsRef.current;
    const orig = origIndexRef.current;
    const to = dropIndex(orig, dy, ROW_SLOT, arr.length);
    // Snap every row back to its natural slot before committing the new order.
    arr.forEach((e) => getTy(e.id).setValue(0));
    if (to !== orig) commit(moveItem(arr, orig, to));
    setDragId(null);
  };

  // One PanResponder per id, created lazily and cached. Only reads refs +
  // stable setters, so the first instance stays correct across renders.
  const respRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const getResponder = (id: string) => {
    let r = respRef.current.get(id);
    if (!r) {
      r = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const orig = itemsRef.current.findIndex((e) => e.id === id);
          origIndexRef.current = orig;
          lastToRef.current = orig;
          getTy(id).setValue(0);
          setDragId(id);
        },
        onPanResponderMove: (_e, g) => {
          getTy(id).setValue(g.dy);
          applyShifts(g.dy);
        },
        onPanResponderRelease: (_e, g) => release(g.dy),
        onPanResponderTerminate: (_e, g) => release(g.dy),
      });
      respRef.current.set(id, r);
    }
    return r;
  };

  // VoiceOver and TalkBack can't drag: the grip offers Move up / Move down.
  const onA11yAction = (index: number) => (e: AccessibilityActionEvent) => {
    const action = e.nativeEvent.actionName;
    if (action !== 'moveUp' && action !== 'moveDown') return;
    const arr = itemsRef.current;
    const to = stepIndex(index, action, arr.length);
    if (to != null) commit(moveItem(arr, index, to));
  };

  if (!visible) return null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: topInset + 14 }]}>
        <Text style={styles.title}>{title}</Text>
        <Pressable style={styles.done} onPress={onDone} accessibilityRole="button" accessibilityLabel={t('reorder.doneLabel')}>
          <Text style={styles.doneText}>{t('common.done')}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        scrollEnabled={dragId == null}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item, i) => {
          const dragged = item.id === dragId;
          const r = row(item);
          return (
            <Animated.View
              key={item.id}
              style={[
                styles.row,
                { borderColor: dragged ? color.accent : color.border },
                { zIndex: dragged ? 60 : 1 },
                dragged && styles.rowDragged,
                { transform: [{ translateY: getTy(item.id) }] },
              ]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{r.initials}</Text>
              </View>
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                  {r.title}
                </Text>
                {r.subtitle != null && <Text style={styles.setsLabel}>{r.subtitle}</Text>}
              </View>
              <View
                style={styles.grip}
                {...getResponder(item.id).panHandlers}
                {...(moveActions && {
                  accessible: true,
                  accessibilityLabel: moveActions.label(r),
                  accessibilityHint: moveActions.hint,
                  accessibilityActions: [
                    { name: 'moveUp', label: moveActions.moveUp },
                    { name: 'moveDown', label: moveActions.moveDown },
                  ],
                  onAccessibilityAction: onA11yAction(i),
                })}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M4 8h16M4 16h16"
                    stroke={color.text3}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 80,
      backgroundColor: color.bg,
      flexDirection: 'column',
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
    },
    title: {
      fontFamily: font.titleSemi,
      fontSize: 17,
      letterSpacing: -0.17,
      color: color.text1,
    },
    done: {
      height: 34,
      paddingHorizontal: 18,
      borderRadius: 9,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneText: {
      fontFamily: font.titleSemi,
      fontSize: 14,
      color: color.accentFg,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingTop: 14,
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    row: {
      height: 60,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 12,
      paddingRight: 4,
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderRadius: 12,
    },
    rowDragged: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.8,
      shadowRadius: 17,
      elevation: 12,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: color.surface3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: font.monoSemi,
      fontSize: 12,
      color: color.accent,
    },
    middle: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontFamily: font.titleSemi,
      fontSize: 14.5,
      letterSpacing: -0.145,
      color: color.text1,
    },
    setsLabel: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      color: color.text3,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
    grip: {
      width: 46,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
