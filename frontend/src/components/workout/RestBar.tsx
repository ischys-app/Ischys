/** Bottom rest bar: idle "tap to start" button, or the active countdown card. */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { ClockBarIcon } from '../icons';
import { fmtRest } from './types';

type Props = {
  resting: boolean;
  remaining: number;
  total: number;
  onStart: () => void;
  onMinus15: () => void;
  onPlus15: () => void;
  onSkip: () => void;
};

export function RestBar({ resting, remaining, total, onStart, onMinus15, onPlus15, onSkip }: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {resting ? (
        <View style={styles.card}>
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
