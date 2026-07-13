/**
 * Workout Summary screen. Renders the WorkoutSummaryOut returned by
 * POST /workouts/{id}/finish (stashed in `summaryCache`). Falls back to
 * getWorkout(id) with a degraded view (no PRs, computed muscle volume) if
 * the cache entry is missing — e.g. deep link / cold start.
 *
 * Source of truth: `export/ischys-app/Workout Summary.dc.html`.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import type {
  WorkoutOut,
  WorkoutSetOut,
  WorkoutSummaryOut,
} from '../../src/api/types';
import { getWorkout, saveAsRoutine } from '../../src/api/workouts';
import { parseServerDate } from '../../src/lib/serverTime';
import { CheckIcon, StarIcon } from '../../src/components/icons';
import { ShareWorkoutSheet } from '../../src/components/ShareWorkoutSheet';
import { fmtDateOnly, fmtDuration } from '../../src/lib/format';
import { getSummary } from '../../src/lib/summaryCache';
import { color, font } from '../../src/theme/tokens';

/** Manual thousands grouping — Hermes' Intl may skip separators. */
function fmtVolumeNoUnit(kg: number): string {
  return String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Extract HH:MM in local time from an ISO string. */
function hhmm(iso: string): string {
  const d = new Date(parseServerDate(iso));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatWhen(startedAt: string, endedAt: string | null | undefined): string {
  const dateStr = fmtDateOnly(startedAt);
  const start = hhmm(startedAt);
  if (!endedAt) return `${dateStr} · ${start}`;
  return `${dateStr} · ${start} – ${hhmm(endedAt)}`;
}

/** Pick the "best" set for the row subtitle. */
function bestSetLine(sets: WorkoutSetOut[]): string {
  const working = sets.filter((s) => s.done && s.type !== 'warmup');
  if (working.length === 0) return `${sets.filter((s) => s.done).length} sets`;
  let best = working[0];
  for (const s of working) {
    const bw = s.weight ?? -Infinity;
    const bbest = best.weight ?? -Infinity;
    if (bw > bbest) best = s;
  }
  const w = best.weight == null ? 'BW' : `${best.weight}kg`;
  const r = best.reps ?? 0;
  return `Best set · ${w} × ${r}`;
}

/** Compute a degraded volume-by-muscle from a WorkoutOut for the fallback view. */
function computeMuscleFromWorkout(w: WorkoutOut): { name: string; sets: number }[] {
  const tally = new Map<string, number>();
  for (const we of w.exercises) {
    const primary = we.exercise.primary_muscle?.group ?? we.exercise.primary_muscle?.name;
    if (!primary) continue;
    const done = we.sets.filter((s) => s.done && s.type !== 'warmup').length;
    if (done === 0) continue;
    tally.set(primary, (tally.get(primary) ?? 0) + done);
  }
  return Array.from(tally.entries())
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets);
}

function CloseIcon({ size = 16, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={tint}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShareIcon({ size = 14, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"
        stroke={tint}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export default function WorkoutSummary() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const workoutId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [summary, setSummary] = useState<WorkoutSummaryOut | null>(() =>
    workoutId ? getSummary(workoutId) : null,
  );
  const [fallbackWorkout, setFallbackWorkout] = useState<WorkoutOut | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  // Fallback: no cached summary (deep-link / refresh) → best-effort getWorkout.
  useEffect(() => {
    if (summary || !workoutId) return;
    let cancelled = false;
    (async () => {
      try {
        const w = await getWorkout(workoutId);
        if (!cancelled) setFallbackWorkout(w);
      } catch {
        // ignore — screen renders an empty shell
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary, workoutId]);

  // Unified view model — either the cached summary or the degraded fallback.
  const view = useMemo(() => {
    if (summary) {
      return {
        workout: summary.workout,
        prs: summary.prs,
        muscles: summary.volume_by_muscle,
      };
    }
    if (fallbackWorkout) {
      return {
        workout: fallbackWorkout,
        prs: [] as WorkoutSummaryOut['prs'],
        muscles: computeMuscleFromWorkout(fallbackWorkout),
      };
    }
    return null;
  }, [summary, fallbackWorkout]);

  // Pop back to wherever we came from (History, Home, or — after finishing, where
  // the workout screen replaced itself — the tab we started on). Only fall back to
  // Home when there is no back stack; replacing with '/(tabs)' unconditionally
  // stacked a second Home on top of the existing one.
  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  const onDone = dismiss;
  const onClose = dismiss;
  const onSaveAsRoutine = async () => {
    if (workoutId) {
      try {
        await saveAsRoutine(workoutId);
      } catch {
        // best-effort — navigate regardless
      }
    }
    dismiss();
  };

  // Empty shell while the fallback is loading (or if it never loads).
  if (!view) {
    return (
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: 56 + insets.top }]}>
          <Pressable style={styles.headerBtn} onPress={onClose} hitSlop={8}>
            <CloseIcon tint={color.text2} />
          </Pressable>
          <Text style={styles.headerTitle}>WORKOUT COMPLETE</Text>
          <View style={styles.headerBtn} />
        </View>
      </View>
    );
  }

  const { workout, prs, muscles } = view;
  const maxSets = muscles.length > 0 ? Math.max(...muscles.map((m) => m.sets)) : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 104 + insets.top },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO */}
        <View style={styles.hero}>
          <View style={styles.checkBadge}>
            <CheckIcon size={30} color={color.accentFg} strokeWidth={3} />
          </View>
          <Text style={styles.workoutName}>{workout.name}</Text>
          <Text style={styles.workoutWhen}>
            {formatWhen(workout.started_at, workout.ended_at)}
          </Text>
        </View>

        {/* STAT GRID */}
        <View style={styles.statGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>DURATION</Text>
            <Text style={styles.statValue}>
              {fmtDuration(workout.duration_seconds)}
              <Text style={styles.statUnit}></Text>
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>VOLUME</Text>
            <Text style={styles.statValue}>
              {fmtVolumeNoUnit(workout.total_volume)}
              <Text style={styles.statUnit}> kg</Text>
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statLabel}>SETS</Text>
            <Text style={styles.statValue}>{workout.total_sets}</Text>
          </View>
        </View>

        {/* PR BANNER */}
        {prs.length > 0 && (
          <View style={styles.prBanner}>
            <View style={styles.prHeader}>
              <StarIcon size={17} color={color.success} strokeWidth={2.4} />
              <Text style={styles.prHeaderText}>
                {`${prs.length} New Personal Record${prs.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <View style={styles.prRows}>
              {prs.map((pr, i) => (
                <View key={`${pr.exercise_id}-${pr.metric}-${i}`} style={styles.prRow}>
                  <Text style={styles.prName} numberOfLines={1} ellipsizeMode="tail">
                    {pr.exercise_name}
                  </Text>
                  <Text style={styles.prValue}>
                    {pr.display} <Text style={styles.prDelta}>{pr.delta_display}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* EXERCISE BREAKDOWN */}
        <Text style={styles.sectionLabel}>
          {`EXERCISES · ${workout.exercises.length}`}
        </Text>
        <View style={styles.exerciseList}>
          {workout.exercises.map((we) => {
            const anyPr = we.sets.some((s) => s.is_pr);
            return (
              <View key={we.id} style={styles.exerciseRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{we.exercise.initials}</Text>
                </View>
                <View style={styles.exerciseText}>
                  <Text style={styles.exerciseName} numberOfLines={1} ellipsizeMode="tail">
                    {we.exercise.name}
                  </Text>
                  <Text style={styles.exerciseBest}>{bestSetLine(we.sets)}</Text>
                </View>
                {anyPr && <StarIcon size={15} color={color.success} strokeWidth={2.4} />}
                <Text style={styles.exerciseSetCount}>{`${we.sets.length} sets`}</Text>
              </View>
            );
          })}
        </View>

        {/* MUSCLE SPLIT */}
        {muscles.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>VOLUME BY MUSCLE</Text>
            <View style={styles.muscleCard}>
              {muscles.map((m) => {
                const pct = maxSets > 0 ? (m.sets / maxSets) * 100 : 0;
                return (
                  <View key={m.name} style={styles.muscleRow}>
                    <View style={styles.muscleHeader}>
                      <Text style={styles.muscleName}>{m.name}</Text>
                      <Text style={styles.muscleSets}>{`${m.sets} sets`}</Text>
                    </View>
                    <View style={styles.muscleTrack}>
                      <View style={[styles.muscleBar, { width: `${pct}%` }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ACTIONS */}
        <View style={styles.actions}>
          <Pressable style={styles.doneBtn} onPress={onDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
          {/* A session started from a routine already has one; offering to save
              it again would just duplicate that routine. */}
          {!workout.routine_id && (
            <Pressable style={styles.saveRoutineBtn} onPress={onSaveAsRoutine}>
              <Text style={styles.saveRoutineBtnText}>Save as Routine</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* HEADER (absolute, on top of scroll) */}
      <View style={[styles.header, { paddingTop: 56 + insets.top }]}>
        <Pressable style={styles.headerBtn} onPress={onClose} hitSlop={8}>
          <CloseIcon tint={color.text2} />
        </Pressable>
        <Text style={styles.headerTitle}>WORKOUT COMPLETE</Text>
        <Pressable
          style={styles.shareBtn}
          onPress={() => setShareOpen(true)}
          hitSlop={8}
        >
          <ShareIcon tint={color.text2} />
          <Text style={styles.shareBtnText}>Share</Text>
        </Pressable>
      </View>

      <ShareWorkoutSheet
        visible={shareOpen}
        summary={
          summary ??
          (fallbackWorkout
            ? {
                workout: fallbackWorkout,
                prs: [],
                volume_by_muscle: muscles,
              }
            : null)
        }
        onClose={() => setShareOpen(false)}
      />
    </View>
  );
}

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },

  // HEADER
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(10,10,11,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
  },
  shareBtn: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text2,
  },

  // SCROLL
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },

  // HERO
  hero: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 26,
  },
  checkBadge: {
    width: 60,
    height: 60,
    borderRadius: 17,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: color.accent,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  workoutName: {
    fontFamily: font.displayBold,
    fontSize: 26,
    letterSpacing: -0.52,
    color: color.text1,
    textAlign: 'center',
  },
  workoutWhen: {
    fontFamily: font.monoRegular,
    fontSize: 12.5,
    color: color.text2,
    marginTop: 4,
    textAlign: 'center',
    fontVariant: tabular,
  },

  // STAT GRID
  statGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCell: {
    flex: 1,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 6,
  },
  statLabel: {
    fontFamily: font.monoMedium,
    fontSize: 9,
    letterSpacing: 0.9,
    color: color.text3,
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 21,
    letterSpacing: -0.42,
    color: color.text1,
    fontVariant: tabular,
  },
  statUnit: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    color: color.text3,
  },

  // PR BANNER
  prBanner: {
    backgroundColor: 'rgba(45,216,129,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(45,216,129,0.28)',
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  prHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 12,
  },
  prHeaderText: {
    fontFamily: font.displayBold,
    fontSize: 14,
    color: color.success,
  },
  prRows: {
    gap: 8,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  prName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 13.5,
    color: color.text1,
  },
  prValue: {
    fontFamily: font.monoSemi,
    fontSize: 13,
    color: color.text1,
    fontVariant: tabular,
  },
  prDelta: {
    color: color.success,
  },

  // EXERCISES
  sectionLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    paddingHorizontal: 2,
    paddingBottom: 12,
  },
  exerciseList: {
    gap: 8,
    marginBottom: 26,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  avatar: {
    width: 36,
    height: 36,
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
  exerciseText: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    letterSpacing: -0.14,
    color: color.text1,
  },
  exerciseBest: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 1,
    fontVariant: tabular,
  },
  exerciseSetCount: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    fontVariant: tabular,
  },

  // MUSCLE SPLIT
  muscleCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 26,
    gap: 13,
  },
  muscleRow: {
    gap: 6,
  },
  muscleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muscleName: {
    fontFamily: font.bodyMedium,
    fontSize: 13,
    color: color.text1,
  },
  muscleSets: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    fontVariant: tabular,
  },
  muscleTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: color.surface3,
    overflow: 'hidden',
  },
  muscleBar: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: color.accent,
  },

  // ACTIONS
  actions: {
    gap: 10,
  },
  doneBtn: {
    height: 50,
    borderRadius: 13,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
  saveRoutineBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveRoutineBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },
});
