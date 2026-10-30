/**
 * Picks which exercises to superset with (#53, board 11a).
 *
 * Lists the workout's other exercises. One accent — Make superset — because
 * that is the only action here that changes anything.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DraggableSheet } from '../DraggableSheet';
import { PressableScale } from '../PressableScale';
import { CheckIcon } from '../icons';
import { color, font, themed } from '../../theme/tokens';
import { exerciseMeta, type Exercise } from './types';
import { useThemed } from '../../theme/ThemeProvider';

/** What the sheet shows of an exercise: a workout's, or a routine's. */
export type SupersetCandidate = Pick<Exercise, 'id' | 'name' | 'equipment' | 'rest' | 'supersetGroup'>;

type Props = {
  visible: boolean;
  /** The exercise the menu was opened on. Always part of the group. */
  anchorExercise: SupersetCandidate | null;
  /** Everything else in the workout or routine, in screen order. */
  candidates: SupersetCandidate[];
  onConfirm: (partnerIds: string[]) => void;
  onClose: () => void;
};

export function SupersetSheet({
  visible,
  anchorExercise,
  candidates,
  onConfirm,
  onClose,
}: Props) {
  useThemed();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // A fresh open starts empty rather than remembering the last pairing, which
  // would otherwise suggest partners from an unrelated exercise.
  useEffect(() => {
    if (visible) setPicked(new Set());
  }, [visible, anchorExercise?.id]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <DraggableSheet visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Superset with…</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      {anchorExercise ? (
        <Text style={styles.sub} numberOfLines={1}>
          Pairs with {anchorExercise.name}
        </Text>
      ) : null}

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {candidates.length === 0 ? (
          <Text style={styles.empty}>
            Add another exercise to this workout first — a superset needs a partner.
          </Text>
        ) : (
          candidates.map((ex) => {
            const on = picked.has(ex.id);
            return (
              <Pressable
                key={ex.id}
                onPress={() => toggle(ex.id)}
                style={styles.row}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <View
                  style={[
                    styles.circle,
                    on ? { borderColor: color.accent, backgroundColor: color.accent } : null,
                  ]}
                >
                  {on ? <CheckIcon size={12} color={color.accentFg} strokeWidth={3.4} /> : null}
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {exerciseMeta(ex)}
                    {ex.supersetGroup != null ? ' · already in a superset' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <PressableScale
        style={[styles.cta, picked.size === 0 && styles.ctaOff]}
        onPress={() => picked.size > 0 && onConfirm([...picked])}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>
          {picked.size === 0 ? 'Pick a partner' : 'Make superset'}
        </Text>
      </PressableScale>
    </DraggableSheet>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingBottom: 16,
    },
    grabberWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
    grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.surface3 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    title: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
    cancel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text2 },
    sub: {
      fontFamily: font.bodyRegular,
      fontSize: 13,
      color: color.text3,
      paddingHorizontal: 16,
      marginTop: 2,
    },
    list: { maxHeight: 320, marginTop: 12 },
    listContent: { paddingHorizontal: 16, gap: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    circle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: color.text3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text1 },
    rowMeta: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3 },
    empty: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, paddingVertical: 12 },
    cta: {
      marginHorizontal: 16,
      marginTop: 12,
      height: 50,
      borderRadius: 14,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaOff: { backgroundColor: color.surface3 },
    ctaText: { fontFamily: font.titleSemi, fontSize: 16, color: color.accentFg },
  }),
);
