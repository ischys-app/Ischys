import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoutineListItem } from '../api/types';
import { color, font, TAP_TARGET } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import { PlayFilledIcon } from './icons';

/**
 * A saved routine with avatar, description and an accent "Start Routine" CTA.
 * The avatar, name and description open the read-only view (#85); starting
 * stays one tap away on the CTA, and editing stays behind the ⋯ menu.
 */
export function RoutineCard({
  routine,
  onOpen,
  onStart,
  onOverflow,
}: {
  routine: RoutineListItem;
  onOpen?: () => void;
  onStart?: () => void;
  onOverflow?: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Pressable
          onPress={onOpen}
          disabled={!onOpen}
          style={({ pressed }) => [styles.body, pressed && styles.bodyPressed]}
          accessibilityRole="button"
          accessibilityLabel={`View ${routine.name}`}
        >
          <View style={styles.avatar}>
            <Text style={styles.initials}>{routine.initials}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {routine.name}
            </Text>
            <Text style={styles.detail} numberOfLines={2}>
              {routine.detail}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onOverflow}
          hitSlop={8}
          style={({ pressed }) => [styles.overflow, pressed && styles.overflowPressed]}
        >
          <Text style={styles.overflowGlyph}>⋯</Text>
        </Pressable>
      </View>
      <PressableScale onPress={onStart} style={styles.cta}>
        <PlayFilledIcon size={16} color={color.accentFg} />
        <Text style={styles.ctaLabel}>Start Routine</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  // The tap target reaches 10 past its content on every side (to 6 from the
  // card edge) without moving anything: the padding is cancelled by the margin.
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    margin: -10,
    padding: 10,
    borderRadius: 12,
  },
  bodyPressed: { backgroundColor: color.surface2 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    color: color.accent,
  },
  info: { flex: 1, minWidth: 0 },
  name: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    letterSpacing: -0.16,
    color: color.text1,
  },
  detail: {
    fontFamily: font.bodyRegular,
    fontSize: 12.5,
    color: color.text2,
    lineHeight: 18,
    marginTop: 3,
  },
  overflow: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowPressed: { backgroundColor: color.surface2 },
  overflowGlyph: { fontSize: 19, lineHeight: 19, color: color.text3 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 46,
    minHeight: TAP_TARGET,
    borderRadius: 11,
    backgroundColor: color.accent,
  },
  ctaPressed: { opacity: 0.9 },
  ctaLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: color.accentFg,
  },
});
