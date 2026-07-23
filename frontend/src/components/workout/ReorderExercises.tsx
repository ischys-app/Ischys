/**
 * Full-screen reorder overlay with drag-to-reorder.
 * Built from the Active Workout design (section B) + drag logic (sections C/D).
 * Drag starts on the grip only; rows shift with a 180ms ease, the dragged row
 * follows the finger with no animation. Uses RN's built-in PanResponder +
 * Animated — no gesture-handler / reanimated.
 */
import { useEffect, useRef, useState } from 'react';
import {
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

import { color, font } from '../../theme/tokens';
import type { Exercise } from './types';

const ROW_SLOT = 70; // row height (60) + marginBottom (10)
const SHIFT_DURATION = 180;

type Props = {
  visible: boolean;
  exercises: Exercise[];
  topInset: number;
  onDone: () => void;
  /** Called once per completed drag, with the reordered array. */
  onReorder: (nextOrder: Exercise[]) => void;
};

export function ReorderExercises({ visible, exercises, topInset, onDone, onReorder }: Props) {
  const [items, setItems] = useState<Exercise[]>(exercises);
  const [dragId, setDragId] = useState<string | null>(null);

  // Latest values read from within the cached PanResponders.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const origIndexRef = useRef(0);
  const lastToRef = useRef(0);

  // Per-exercise translateY, keyed by id so it survives reorders.
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
    if (dragId == null) setItems(exercises);
  }, [exercises, dragId]);

  // Shift the non-dragged rows toward the drop target (animated), leaving the
  // dragged row to follow the finger directly.
  const applyShifts = (dy: number) => {
    const arr = itemsRef.current;
    const n = arr.length;
    const orig = origIndexRef.current;
    const to = Math.max(0, Math.min(n - 1, orig + Math.round(dy / ROW_SLOT)));
    if (to === lastToRef.current) return; // target unchanged — keep animations running
    lastToRef.current = to;
    arr.forEach((e, j) => {
      if (j === orig) return; // the dragged row is driven directly
      let shift = 0;
      if (to > orig && j > orig && j <= to) shift = -ROW_SLOT;
      else if (to < orig && j >= to && j < orig) shift = ROW_SLOT;
      Animated.timing(getTy(e.id), {
        toValue: shift,
        duration: SHIFT_DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  const release = (dy: number) => {
    const arr = itemsRef.current;
    const n = arr.length;
    const orig = origIndexRef.current;
    const to = Math.max(0, Math.min(n - 1, orig + Math.round(dy / ROW_SLOT)));
    // Snap every row back to its natural slot before committing the new order.
    arr.forEach((e) => getTy(e.id).setValue(0));
    if (to !== orig) {
      const next = [...arr];
      const [moved] = next.splice(orig, 1);
      next.splice(to, 0, moved);
      setItems(next);
      onReorderRef.current(next);
    }
    setDragId(null);
  };

  // One PanResponder per exercise id, created lazily and cached. Only reads
  // refs + stable setters, so the first instance stays correct across renders.
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

  if (!visible) return null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: topInset + 14 }]}>
        <Text style={styles.title}>Reorder Exercises</Text>
        <Pressable style={styles.done} onPress={onDone} accessibilityRole="button" accessibilityLabel="Done reordering">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        scrollEnabled={dragId == null}
        showsVerticalScrollIndicator={false}
      >
        {items.map((ex) => {
          const dragged = ex.id === dragId;
          return (
            <Animated.View
              key={ex.id}
              style={[
                styles.row,
                { borderColor: dragged ? color.accent : color.border },
                { zIndex: dragged ? 60 : 1 },
                dragged && styles.rowDragged,
                { transform: [{ translateY: getTy(ex.id) }] },
              ]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{ex.initials}</Text>
              </View>
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
                  {ex.name}
                </Text>
                <Text style={styles.setsLabel}>{ex.sets.length} sets</Text>
              </View>
              <View style={styles.grip} {...getResponder(ex.id).panHandlers}>
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

const styles = StyleSheet.create({
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
});
