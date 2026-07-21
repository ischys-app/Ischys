/** Fixed top header: back, title/status, Finish, and the TIME/VOLUME/SETS strip. */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { color, font } from '../../theme/tokens';
import { BackChevronIcon, HeartFilledIcon, TrashIcon } from '../icons';

type Props = {
  topInset: number;
  name: string;
  status: string;
  time: string;
  volume: string;
  unit: string;
  sets: string;
  onBack: () => void;
  onFinish: () => void;
  /** Abandon the session without recording it. Omitted → no discard control. */
  onDiscard?: () => void;
  /** Live heart-rate BPM; when supplied renders the HR chip before Finish. */
  heartRate?: number | null;
  /** Live active energy (kcal) a Watch is burning; renders a chip beside HR. */
  activeCal?: number | null;
};

/** Pulsing heart used inside the HR overlay. Scale 1 → 1.28 → 1 over 1s loop. */
function PulsingHeart() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.28,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <HeartFilledIcon size={13} color={color.error} />
    </Animated.View>
  );
}

export function WorkoutHeader({
  topInset,
  name,
  status,
  time,
  volume,
  unit,
  sets,
  onBack,
  onFinish,
  onDiscard,
  heartRate,
  activeCal,
}: Props) {
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={styles.back} hitSlop={6}>
          <BackChevronIcon color={color.text2} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.status}>{status}</Text>
        </View>
        {heartRate != null && (
          <View style={styles.hrChip} accessibilityLabel={`Heart rate ${heartRate} bpm`}>
            <PulsingHeart />
            <Text style={styles.hrValue}>{String(heartRate)}</Text>
          </View>
        )}
        {activeCal != null && activeCal > 0 && (
          <View style={styles.calChip} accessibilityLabel={`Active energy ${activeCal} calories`}>
            <Text style={styles.calValue}>{String(activeCal)}</Text>
            <Text style={styles.calUnit}>cal</Text>
          </View>
        )}
        {onDiscard && (
          <Pressable
            onPress={onDiscard}
            style={({ pressed }) => [styles.discard, pressed && styles.discardPressed]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Discard workout"
          >
            <TrashIcon size={16} color={color.text3} strokeWidth={2.2} />
          </Pressable>
        )}
        <Pressable onPress={onFinish} style={styles.finish}>
          <Text style={styles.finishText}>Finish</Text>
        </Pressable>
      </View>

      <View style={styles.strip}>
        <View style={styles.statTime}>
          <Text style={styles.statLabel}>TIME</Text>
          <Text style={styles.statValue}>{time}</Text>
        </View>
        <View style={styles.statVolume}>
          <Text style={styles.statLabel}>VOLUME</Text>
          <Text style={styles.statValue}>
            {volume}
            <Text style={styles.statUnit}> {unit}</Text>
          </Text>
        </View>
        <View style={styles.statSets}>
          <Text style={styles.statLabel}>SETS</Text>
          <Text style={styles.statValue}>{sets}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.86)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  back: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
  status: { fontFamily: font.monoRegular, fontSize: 11.5, color: color.text3 },
  discard: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardPressed: { opacity: 0.6 },
  finish: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: { fontFamily: font.titleSemi, fontSize: 14, color: color.accentFg },

  // Live heart-rate overlay (visible only when Read HR permission is on).
  hrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: 'rgba(255,77,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.24)',
    flexShrink: 0,
    marginRight: 8,
  },
  hrValue: {
    fontFamily: font.monoSemi,
    fontSize: 13,
    fontWeight: '600',
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  calChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: 'rgba(255,149,0,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.24)',
    flexShrink: 0,
    marginRight: 8,
  },
  calValue: {
    fontFamily: font.monoSemi,
    fontSize: 13,
    fontWeight: '600',
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  calUnit: {
    fontFamily: font.monoSemi,
    fontSize: 10,
    color: color.text3,
  },

  strip: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  statTime: { flex: 1, flexDirection: 'column', gap: 2 },
  statVolume: { flex: 1.3, flexDirection: 'column', gap: 2 },
  statSets: { flex: 0.8, flexDirection: 'column', gap: 2 },
  statLabel: {
    fontFamily: font.monoMedium,
    fontSize: 9.5,
    letterSpacing: 1.14,
    color: color.text3,
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 18,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    color: color.text3,
  },
});
