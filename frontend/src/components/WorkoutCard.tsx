import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { WorkoutListItem } from '../api/types';
import { fmtDuration, fmtVolumeFull, fmtWorkoutDate } from '../lib/format';
import { color, font } from '../theme/tokens';
import { PrPill } from './PrPill';
import { TagChip } from './TagChip';

/** A recent-workout summary card. */
export function WorkoutCard({
  workout,
  onPress,
  onLongPress,
}: {
  workout: WorkoutListItem;
  onPress?: () => void;
  /** Long-press the card. Omitted → no long-press affordance. */
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={workout.name}
      accessibilityHint={onLongPress ? 'Long-press to delete this workout.' : undefined}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.name} numberOfLines={1}>
            {workout.name}
          </Text>
          <Text style={styles.date}>{fmtWorkoutDate(workout.started_at)}</Text>
        </View>
        {workout.pr_count > 0 ? <PrPill count={workout.pr_count} /> : null}
      </View>

      <View style={styles.stats}>
        <Stat label="TIME" value={fmtDuration(workout.duration_seconds)} />
        <Stat label="VOLUME" value={fmtVolumeFull(workout.total_volume)} />
        <Stat label="SETS" value={String(workout.total_sets)} />
      </View>

      {workout.muscle_tags.length > 0 ? (
        <View style={styles.tags}>
          {workout.muscle_tags.map((t) => (
            <TagChip key={t} label={t} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
  },
  pressed: { borderColor: color.text3 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: { flex: 1, minWidth: 0, marginRight: 8 },
  name: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    letterSpacing: -0.16,
    color: color.text1,
  },
  date: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  stats: { flexDirection: 'row', gap: 20, marginBottom: 12 },
  stat: { flexDirection: 'column', gap: 1 },
  statLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: color.text3,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 15,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
