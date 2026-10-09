/** Fixed top header: back, discard, title/status, Finish, and the TIME/VOLUME/SETS/HR/CAL strip. */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, TAP_TARGET } from '../../theme/tokens';
import { textScale } from '../../theme/textScale';
import { DraggableSheet } from '../DraggableSheet';
import { PressableScale } from '../PressableScale';
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
  /** Live heart-rate BPM. Non-null implies a paired Watch → HR + CAL columns show. */
  heartRate?: number | null;
  /** Live active energy (kcal) a Watch is burning; shown beside HR. */
  activeCal?: number | null;
};

/** Pulsing heart glyph. Scale 1 → 1.28 → 1 over a 1s loop. */
function PulsingHeart({ size = 9 }: { size?: number }) {
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
      <HeartFilledIcon size={size} color={color.error} />
    </Animated.View>
  );
}

/**
 * Discard is irreversible, so it needs a confirmation. The design wires the button
 * to a trigger but leaves the sheet undrawn — this reuses the app's bottom-sheet
 * pattern (grabber, drag-to-dismiss, 0.55 backdrop) and keeps the copy specific
 * about exactly what is lost.
 */
function ConfirmDiscardSheet({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <DraggableSheet
      visible={visible}
      onClose={onCancel}
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
    >
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>
      <View style={styles.sheetBody}>
        <Text style={styles.sheetTitle}>Discard this workout?</Text>
        <Text style={styles.sheetText}>
          Every set you&apos;ve logged, plus your time and volume, is deleted for good. This
          can&apos;t be undone, and nothing is saved to your history.
        </Text>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [styles.sheetDiscard, pressed && styles.sheetDiscardPressed]}
          accessibilityRole="button"
          accessibilityLabel="Discard workout"
        >
          <Text maxFontSizeMultiplier={textScale.control} style={styles.sheetDiscardText}>Discard workout</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.sheetCancel, pressed && styles.sheetCancelPressed]}
          accessibilityRole="button"
        >
          <Text maxFontSizeMultiplier={textScale.control} style={styles.sheetCancelText}>Keep going</Text>
        </Pressable>
      </View>
    </DraggableSheet>
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  // A Watch feeding live HR is the signal a Watch is connected; HR + CAL ride
  // in the data strip (mono label + tabular value) instead of tinted chips.
  const watchConnected = heartRate != null;

  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.topRow}>
        <Pressable
          onPress={onBack}
          style={styles.back}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Minimise workout"
          accessibilityHint="Keeps it running and goes back"
        >
          <BackChevronIcon color={color.text2} strokeWidth={2.2} />
        </Pressable>
        {onDiscard && (
          <Pressable
            onPress={() => setConfirmOpen(true)}
            style={({ pressed }) => [styles.discard, pressed && styles.discardPressed]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Discard workout"
          >
            {({ pressed }) => (
              <TrashIcon size={16} color={pressed ? color.error : color.text3} strokeWidth={2.2} />
            )}
          </Pressable>
        )}
        <View style={styles.titleWrap}>
          <Text maxFontSizeMultiplier={textScale.display} style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.status}>{status}</Text>
        </View>
        <PressableScale onPress={onFinish} style={styles.finish}>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.finishText}>Finish</Text>
        </PressableScale>
      </View>

      <View style={styles.strip}>
        <View style={styles.statTime}>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>TIME</Text>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>{time}</Text>
        </View>
        <View style={styles.statVolume}>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>VOLUME</Text>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>
            {volume}
            <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statUnit}> {unit}</Text>
          </Text>
        </View>
        <View style={styles.statSets}>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>SETS</Text>
          <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>{sets}</Text>
        </View>
        {watchConnected && (
          <>
            <View style={styles.statHr}>
              <View style={styles.hrLabelRow}>
                <PulsingHeart size={9} />
                <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>HR</Text>
              </View>
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>{String(heartRate)}</Text>
            </View>
            <View style={styles.statCal}>
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statLabel}>CAL</Text>
              <Text maxFontSizeMultiplier={textScale.fixed} style={styles.statValue}>{String(activeCal ?? 0)}</Text>
            </View>
          </>
        )}
      </View>

      {onDiscard && (
        <ConfirmDiscardSheet
          visible={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onDiscard();
          }}
        />
      )}
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
  // Far left, beside the collapse chevron — opposite end from the primary Finish.
  discard: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discardPressed: { borderColor: 'rgba(255,77,77,0.4)' },
  titleWrap: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
  status: { fontFamily: font.monoRegular, fontSize: 11.5, color: color.text3 },
  finish: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 9,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishText: { fontFamily: font.titleSemi, fontSize: 14, color: color.accentFg },

  strip: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  statTime: { flex: 1, flexDirection: 'column', gap: 2 },
  statVolume: { flex: 1.3, flexDirection: 'column', gap: 2 },
  statSets: { flex: 0.8, flexDirection: 'column', gap: 2 },
  statHr: { flex: 0.85, flexDirection: 'column', gap: 2 },
  statCal: { flex: 0.85, flexDirection: 'column', gap: 2 },
  hrLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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

  // Confirm-discard sheet
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
  sheetBody: { paddingHorizontal: 20, paddingTop: 10 },
  sheetTitle: {
    fontFamily: font.titleSemi,
    fontSize: 19,
    letterSpacing: -0.19,
    color: color.text1,
  },
  sheetText: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    color: color.text2,
    marginTop: 10,
    marginBottom: 20,
  },
  sheetDiscard: {
    height: 52,
    borderRadius: 14,
    backgroundColor: color.error,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TAP_TARGET,
  },
  sheetDiscardPressed: { opacity: 0.9 },
  sheetDiscardText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: '#FFFFFF',
  },
  sheetCancel: {
    height: 50,
    borderRadius: 14,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: TAP_TARGET,
  },
  sheetCancelPressed: { borderColor: color.text3 },
  sheetCancelText: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
  },
});
