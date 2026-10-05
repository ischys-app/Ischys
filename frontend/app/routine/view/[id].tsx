/**
 * Routine View — read a routine without editing or starting it (#85).
 * Source-of-truth: design_handoff_release4/boards/Routine Preview.dc.html (15a).
 *
 * Nothing here is a field: values are plain text, so a routine can be checked
 * the night before without the risk of changing it. Edit opens the builder;
 * Start replaces this screen, so Back from the workout lands on Home as it does
 * when starting from the card.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { getRoutine, getRoutineHistory, type RoutineHistory } from '../../../src/api/routines';
import type { RoutineOut } from '../../../src/api/types';
import { startWorkout } from '../../../src/api/workouts';
import { PlayFilledIcon, PlusIcon } from '../../../src/components/icons';
import { PressableScale } from '../../../src/components/PressableScale';
import { fmtRest, typeMeta } from '../../../src/components/workout/types';
import {
  buildRoutineView,
  estimateDurationSeconds,
  routineCountsLabel,
  type ViewBlock,
  type ViewCard,
  type ViewRest,
} from '../../../src/domain/routineView';
import { fmtDuration, fmtShortDayUpper } from '../../../src/lib/format';
import { useWeightUnit } from '../../../src/lib/weightUnit';
import { color, font, TAP_TARGET } from '../../../src/theme/tokens';

/** Header: 8 above the row, a 34pt row, 12 below. */
const HEADER_TOP = 8;
const HEADER_ROW = 34;
const HEADER_BOTTOM = 12;
/** Footer: 36 of fade above the 52pt button. */
const FOOTER_TOP = 36;
const CTA_HEIGHT = 52;

/** "Dumbbell · Rest 2:30", "Barbell · then A2", "Barbell · Rest after round 1:30". */
function restText(rest: ViewRest): string {
  if (rest.kind === 'then') return `then ${rest.tag}`;
  const clock = fmtRest(rest.seconds);
  if (rest.kind === 'afterRound') return rest.seconds > 0 ? `Rest after round ${clock}` : 'Rest off';
  return rest.seconds > 0 ? `Rest ${clock}` : 'Rest off';
}

/**
 * A vertical fade of the page background, behind the header and the pinned
 * button. `stops` are [offset, opacity] pairs, top to bottom.
 */
function Fade({ id, stops }: { id: string; stops: [number, number][] }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {stops.map(([offset, opacity]) => (
            <Stop key={offset} offset={offset} stopColor={color.bg} stopOpacity={opacity} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export default function RoutineView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useWeightUnit();
  const params = useLocalSearchParams<{ id: string }>();
  const routineId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [routine, setRoutine] = useState<RoutineOut | null>(null);
  const [history, setHistory] = useState<RoutineHistory | null>(null);
  const [starting, setStarting] = useState(false);

  // On focus, not on mount: coming back from the builder must show what was saved.
  useFocusEffect(
    useCallback(() => {
      if (!routineId) return;
      let cancelled = false;
      (async () => {
        try {
          const [r, h] = await Promise.all([getRoutine(routineId), getRoutineHistory(routineId)]);
          if (cancelled) return;
          setRoutine(r);
          setHistory(h);
        } catch (e) {
          console.warn(e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [routineId]),
  );

  const blocks = useMemo<ViewBlock[]>(() => {
    if (!routine) return [];
    return buildRoutineView(
      routine.exercises.map((re) => ({
        id: re.id,
        exerciseId: re.exercise.id,
        name: re.exercise.name,
        initials: re.exercise.initials,
        kind: re.exercise.kind,
        equipment: re.exercise.equipment,
        restSeconds: re.rest_seconds,
        supersetGroup: re.superset_group ?? null,
        note: re.note ?? null,
        sets: re.sets.map((s) => ({
          type: s.type,
          weight: s.target_weight ?? null,
          reps: s.target_reps ?? null,
        })),
      })),
      history?.last?.exercises ?? null,
      unit,
    );
  }, [routine, history, unit]);

  const last = history?.last ?? null;
  const hasLast = last != null;
  const isEmpty = !!routine && routine.exercises.length === 0;

  const metaLine = useMemo(() => {
    if (!routine) return '';
    const counts = routineCountsLabel(
      routine.exercises.length,
      routine.exercises.reduce((n, re) => n + re.sets.length, 0),
    );
    const estimate = estimateDurationSeconds(history?.recentDurations ?? []);
    return estimate == null ? counts : `${counts} · ~${fmtDuration(estimate)}`;
  }, [routine, history]);

  const lastLine = useMemo(() => {
    if (!last) return 'NOT DONE YET';
    const day = fmtShortDayUpper(new Date(last.startedAt));
    return last.durationSeconds > 0
      ? `LAST · ${day} · ${fmtDuration(last.durationSeconds)}`
      : `LAST · ${day}`;
  }, [last]);

  const openBuilder = () => {
    if (routineId) router.push(`/routine/${routineId}`);
  };

  const start = async () => {
    if (!routineId || starting) return;
    setStarting(true);
    try {
      const w = await startWorkout({ routine_id: routineId });
      // Replace, so Back from the workout returns to Home rather than here.
      router.replace(`/workout/${w.id}`);
    } catch (e) {
      console.warn(e);
      setStarting(false);
    }
  };

  const bottomInset = Math.max(insets.bottom, 16);
  const headerHeight = insets.top + HEADER_TOP + HEADER_ROW + HEADER_BOTTOM;
  const footerHeight = FOOTER_TOP + CTA_HEIGHT + bottomInset;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: headerHeight + 2,
          paddingHorizontal: 16,
          paddingBottom: footerHeight + 18,
        }}
        showsVerticalScrollIndicator={false}
      >
        {routine ? (
          <>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{routine.name}</Text>
              <Text style={styles.meta}>{metaLine}</Text>
              <Text style={styles.last}>{lastLine}</Text>
            </View>

            <View style={styles.blocks}>
              {blocks.map((block) => (
                <View key={block.key}>
                  {block.group ? (
                    <>
                      <View style={styles.rail} />
                      <View style={styles.groupHead}>
                        <Text style={styles.groupLabel}>{block.group.label}</Text>
                        {block.group.sub ? (
                          <Text style={styles.groupSub}>{block.group.sub}</Text>
                        ) : null}
                      </View>
                    </>
                  ) : null}
                  <View style={block.group ? styles.groupCards : undefined}>
                    {block.cards.map((card) => (
                      <ExerciseCard key={card.key} card={card} hasLast={hasLast} />
                    ))}
                  </View>
                </View>
              ))}

              {isEmpty ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>No exercises yet</Text>
                  <Text style={styles.emptySub}>Add some before this routine can be started.</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* Header (absolute, over a fade of the page background). */}
      <View style={[styles.header, { paddingTop: insets.top + HEADER_TOP }]}>
        <Fade
          id="routineViewHeaderFade"
          stops={[
            [0, 0.97],
            [0.72, 0.97],
            [1, 0],
          ]}
        />
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Svg width={9} height={15} viewBox="0 0 9 15" fill="none">
            <Path
              d="M7.5 1.5L1.5 7.5l6 6"
              stroke={color.text2}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <Text style={styles.headerLabel}>ROUTINE</Text>
        <PressableScale
          onPress={openBuilder}
          style={styles.editBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit routine"
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"
              stroke={color.text1}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.editText}>Edit</Text>
        </PressableScale>
      </View>

      {/* Pinned action. An empty routine cannot start, so the one action adds to it. */}
      {routine ? (
        <View
          style={[styles.footer, { paddingBottom: bottomInset }]}
          pointerEvents="box-none"
        >
          <Fade
            id="routineViewFooterFade"
            stops={[
              [0, 0],
              [0.38, 1],
              [1, 1],
            ]}
          />
          <PressableScale
            onPress={isEmpty ? openBuilder : start}
            disabled={starting}
            style={styles.cta}
            accessibilityRole="button"
          >
            {isEmpty ? (
              <PlusIcon size={16} color={color.accentFg} strokeWidth={2.6} />
            ) : (
              <PlayFilledIcon size={16} color={color.accentFg} />
            )}
            <Text style={styles.ctaLabel}>{isEmpty ? 'Add exercises' : 'Start Routine'}</Text>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

function ExerciseCard({ card, hasLast }: { card: ViewCard; hasLast: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{card.initials}</Text>
        </View>
        <View style={styles.cardHeadText}>
          <Text style={styles.exName}>{card.name}</Text>
          <View style={styles.exMetaRow}>
            {card.tag ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{card.tag}</Text>
              </View>
            ) : null}
            <Text style={styles.exMeta} numberOfLines={1}>
              {`${card.equipment} · ${restText(card.rest)}`}
            </Text>
          </View>
        </View>
      </View>

      {card.note ? <Text style={styles.note}>{card.note}</Text> : null}

      <View style={styles.tableHead}>
        <Text style={[styles.th, styles.colSet]}>SET</Text>
        <Text style={[styles.th, styles.colTarget]}>{`TARGET ${card.unitLabel}`}</Text>
        {hasLast ? <Text style={styles.th}>LAST</Text> : null}
      </View>
      {card.sets.map((s, i) => (
        <View key={s.key} style={[styles.row, i < card.sets.length - 1 && styles.rowRule]}>
          <Text style={[styles.badge, styles.colSet, { color: typeMeta[s.type].color }]}>
            {s.badge}
          </Text>
          <Text style={[styles.target, styles.colTarget]} numberOfLines={1}>
            {s.target}
          </Text>
          {hasLast ? (
            <Text style={styles.lastCell} numberOfLines={1}>
              {s.last}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: HEADER_BOTTOM,
  },
  backBtn: {
    width: 34,
    height: HEADER_ROW,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
  },
  editBtn: {
    height: HEADER_ROW,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text1,
  },

  // Title -------------------------------------------------------------
  titleBlock: { paddingTop: 4, paddingHorizontal: 2, paddingBottom: 20 },
  title: {
    fontFamily: font.displayBold,
    fontSize: 26,
    lineHeight: 29.9,
    letterSpacing: -0.52,
    color: color.text1,
  },
  meta: {
    fontFamily: font.monoRegular,
    fontSize: 12.5,
    color: color.text2,
    marginTop: 8,
    fontVariant: tabular,
  },
  last: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.46,
    color: color.text3,
    marginTop: 4,
    fontVariant: tabular,
  },

  // Blocks ------------------------------------------------------------
  blocks: { gap: 10 },
  rail: {
    position: 'absolute',
    left: -9,
    top: 9,
    bottom: 6,
    width: 2,
    borderRadius: 2,
    backgroundColor: color.text3,
  },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 22,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  groupLabel: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text2,
  },
  groupSub: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    fontVariant: tabular,
  },
  groupCards: { gap: 4 },

  // Exercise card -----------------------------------------------------
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
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
  cardHeadText: { flex: 1, minWidth: 0 },
  exName: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.15,
    color: color.text1,
  },
  exMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  tag: {
    backgroundColor: color.surface3,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  tagText: {
    fontFamily: font.monoSemi,
    fontSize: 10,
    color: color.text1,
    fontVariant: tabular,
  },
  exMeta: {
    flexShrink: 1,
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    fontVariant: tabular,
  },
  note: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    lineHeight: 18.85,
    color: color.text2,
    marginTop: 10,
    paddingHorizontal: 2,
  },

  // Table -------------------------------------------------------------
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 2,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  th: {
    fontFamily: font.monoMedium,
    fontSize: 9.5,
    letterSpacing: 0.76,
    color: color.text3,
  },
  colSet: { width: 26 },
  colTarget: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 36,
    paddingHorizontal: 2,
  },
  rowRule: { borderBottomWidth: 1, borderBottomColor: color.hair },
  badge: {
    fontFamily: font.monoSemi,
    fontSize: 12.5,
    fontVariant: tabular,
  },
  target: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.text1,
    fontVariant: tabular,
  },
  lastCell: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: tabular,
  },

  // Empty -------------------------------------------------------------
  empty: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.border,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: font.titleSemi,
    fontSize: 16,
    color: color.text1,
    textAlign: 'center',
  },
  emptySub: {
    fontFamily: font.bodyRegular,
    fontSize: 13.5,
    lineHeight: 20.25,
    color: color.text2,
    textAlign: 'center',
    marginTop: 6,
  },

  // Footer ------------------------------------------------------------
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: FOOTER_TOP,
    paddingHorizontal: 16,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: CTA_HEIGHT,
    minHeight: TAP_TARGET,
    borderRadius: 14,
    backgroundColor: color.accent,
  },
  ctaLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    color: color.accentFg,
  },
});
