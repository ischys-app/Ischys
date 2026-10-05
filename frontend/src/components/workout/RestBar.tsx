/** Bottom rest bar: idle "tap to start" button, or the active countdown card. */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  effortAsk,
  effortHint,
  effortMeaning,
  effortSavedLabel,
  type EffortScaleKind,
} from '../../domain/effort';
import { color, font } from '../../theme/tokens';
import { ClockBarIcon } from '../icons';
import { EffortScale } from './EffortScale';
import { fmtRest } from './types';

/**
 * The question the rest bar asks about the set just ticked (#84, board 14a
 * F2/F4). Rest is the one moment in a set when hands and attention are free,
 * so the rating lives here rather than in the row or in a sheet: ignoring it
 * costs nothing, and it goes when the rest does.
 */
export type RestBarEffort = {
  kind: EffortScaleKind;
  /** The set's badge — "3", "W" — for "SET 3 · HOW HARD?". */
  badge: string;
  /** The set's rating, as RPE; null until it has one. */
  rpe: number | null;
  /** The set was rated from this prompt: fold to "@8 saved". */
  saved: boolean;
  onRate: (rpe: number) => void;
};

type Props = {
  resting: boolean;
  remaining: number;
  total: number;
  onStart: () => void;
  onMinus15: () => void;
  onPlus15: () => void;
  onSkip: () => void;
  /** Absent → the card is exactly the countdown card it always was. */
  effort?: RestBarEffort | null;
};

export function RestBar({
  resting,
  remaining,
  total,
  onStart,
  onMinus15,
  onPlus15,
  onSkip,
  effort,
}: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {resting ? (
        <View style={styles.card}>
          {effort ? <EffortSection effort={effort} /> : null}
          <View style={styles.cardRow}>
            <Pressable onPress={onMinus15} style={styles.adjust}>
              <Text style={styles.adjustText}>{'−15'}</Text>
            </Pressable>
            <View style={styles.center}>
              <Text style={styles.restKicker}>REST</Text>
              <Text style={styles.restTimer}>{fmtRest(remaining)}</Text>
            </View>
            <Pressable onPress={onPlus15} style={styles.adjust}>
              <Text style={styles.adjustText}>+15</Text>
            </Pressable>
            <Pressable onPress={onSkip} style={styles.skip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${pct}%` }]} />
          </View>
        </View>
      ) : (
        <Pressable onPress={onStart} style={styles.idle}>
          <ClockBarIcon size={15} color={color.accent} strokeWidth={2.2} />
          <Text style={styles.idleText}>
            Rest Timer <Text style={styles.idleHint}>— tap to start</Text>
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function EffortSection({ effort }: { effort: RestBarEffort }) {
  // The value under the thumb, so the prompt can say what it means.
  const [preview, setPreview] = useState<number | null>(null);

  if (effort.saved && effort.rpe != null) {
    return (
      <View style={[styles.effort, styles.effortFolded]}>
        <Text style={styles.effortAsk}>{effortSavedLabel(effort.rpe, effort.kind)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.effort}>
      <View style={styles.effortHead}>
        <Text style={styles.effortAsk} numberOfLines={1}>
          {effortAsk(effort.badge, effort.kind)}
        </Text>
        <Text style={[styles.effortHint, preview != null && styles.effortHintLive]} numberOfLines={1}>
          {preview != null ? effortMeaning(preview, effort.kind) : effortHint(effort.kind)}
        </Text>
      </View>
      <EffortScale
        kind={effort.kind}
        value={effort.rpe}
        onPreview={setPreview}
        onCommit={effort.onRate}
      />
    </View>
  );
}

const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.7,
  shadowRadius: 30,
  elevation: 14,
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    paddingHorizontal: 12,
    paddingBottom: 26,
  },
  idle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: 'rgba(23,23,26,0.9)',
    ...shadow,
  },
  idleText: { fontFamily: font.titleSemi, fontSize: 13, color: color.text2 },
  idleHint: { fontFamily: font.bodyMedium, color: color.text3 },

  card: {
    backgroundColor: color.surface3,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    overflow: 'hidden',
    ...shadow,
  },
  // Effort section, above the countdown.
  effort: {
    paddingTop: 11,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  effortFolded: { paddingBottom: 11 },
  effortHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 9,
  },
  effortAsk: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 1.52,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  effortHint: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 1.2,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  // While scrubbing this is the answer, not a hint: one step brighter.
  effortHintLive: { color: color.text2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  adjust: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustText: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  center: { flex: 1, flexDirection: 'column', alignItems: 'center', gap: 1 },
  restKicker: { fontFamily: font.monoMedium, fontSize: 9.5, letterSpacing: 1.52, color: color.accent },
  restTimer: {
    fontFamily: font.monoSemi,
    fontSize: 26,
    lineHeight: 28,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  skip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: { fontFamily: font.titleSemi, fontSize: 13, color: color.accentFg },
  track: { height: 3, backgroundColor: color.surface2 },
  fill: { height: '100%', backgroundColor: color.accent },
});
