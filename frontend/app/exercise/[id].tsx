/**
 * Exercise Detail — About / History / Charts tabs for a single catalog exercise.
 * Source of truth: export/ischys-app/Exercise Detail.dc.html.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import type {
  ChartOut,
  ExerciseOut,
  HistorySessionOut,
  HistorySetOut,
  RecordMetric,
  RecordOut,
} from '../../src/api/types';
import {
  getExercise,
  getExerciseChart,
  getExerciseHistory,
  getExerciseRecords,
} from '../../src/api/workouts';
import { DemoSlot } from '../../src/components/DemoSlot';
import { mediaUrl } from '../../src/lib/media';
import { StarIcon } from '../../src/components/icons';
import { fmtDateOnly } from '../../src/lib/format';
import { color, font } from '../../src/theme/tokens';

type TabKey = 'about' | 'history' | 'charts';

const RECORD_LABELS: Record<RecordMetric, string> = {
  best_set: 'BEST SET',
  est_1rm: 'EST. 1RM',
  best_volume: 'BEST VOLUME',
  max_reps: 'MAX REPS',
};

/** Metrics charted over the last sessions, in the order shown on the Charts tab. */
const CHART_METRICS: RecordMetric[] = ['best_set', 'est_1rm', 'best_volume', 'max_reps'];
const CHART_SESSIONS = 6;

/** Unit shown in a point's tooltip; reps for max_reps, kilograms otherwise. */
const CHART_UNIT: Record<RecordMetric, string> = {
  best_set: 'kg',
  est_1rm: 'kg',
  best_volume: 'kg',
  max_reps: 'reps',
};

export default function ExerciseDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [tab, setTab] = useState<TabKey>('about');
  const [exercise, setExercise] = useState<ExerciseOut | null>(null);
  const [history, setHistory] = useState<HistorySessionOut[]>([]);
  const [records, setRecords] = useState<RecordOut[]>([]);
  const [charts, setCharts] = useState<ChartOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [ex, hist, recs, chs] = await Promise.all([
          getExercise(id),
          getExerciseHistory(id).catch(() => [] as HistorySessionOut[]),
          getExerciseRecords(id).catch(() => [] as RecordOut[]),
          Promise.all(
            CHART_METRICS.map((metric) =>
              getExerciseChart(id, metric, CHART_SESSIONS).catch(
                () => ({ metric, labels: [], values: [] }) as ChartOut,
              ),
            ),
          ),
        ]);
        if (cancelled) return;
        setExercise(ex);
        setHistory(hist);
        setRecords(recs);
        setCharts(chs);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load exercise');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const title = exercise?.name ?? (loading ? 'Loading' : 'Exercise');

  return (
    <View style={styles.root}>
      {/* SCROLL — sits behind the absolutely-positioned header. */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: 152 + insets.top,
          paddingHorizontal: 16,
          paddingBottom: 32 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.loading}>Loading…</Text>
        ) : error ? (
          <Text style={styles.loading}>{error}</Text>
        ) : tab === 'about' ? (
          <AboutTab exercise={exercise} />
        ) : tab === 'history' ? (
          <HistoryTab history={history} />
        ) : (
          <ChartsTab records={records} charts={charts} />
        )}
      </ScrollView>

      {/* HEADER (absolute, blurred-tint via solid rgba). */}
      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Svg width={9} height={15} viewBox="0 0 9 15" fill="none">
              <Path
                d="M7 2L2 7.5 7 13"
                stroke={color.text2}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Pressable
            onPress={() => {
              /* right slot reserved */
            }}
            style={styles.iconBtn}
            hitSlop={8}
          />
        </View>

        <View style={styles.tabs}>
          {(['about', 'history', 'charts'] as const).map((k) => {
            const active = tab === k;
            const label = k === 'about' ? 'About' : k === 'history' ? 'History' : 'Charts';
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                style={[
                  styles.tab,
                  { borderBottomColor: active ? color.accent : color.hair },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? color.text1 : color.text3 },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

function AboutTab({ exercise }: { exercise: ExerciseOut | null }) {
  if (!exercise) return null;
  const primary = exercise.primary_muscle?.name ?? '—';
  const secondary = exercise.secondary_muscles?.[0]?.name ?? '—';
  const steps = exercise.how_to_steps ?? [];
  return (
    <View>
      {/* Demo slot */}
      <View style={styles.demoWrap}>
        <DemoSlot
          exerciseId={exercise.id}
          initialUrl={exercise.demo_url ?? null}
          fallbackImageUrl={mediaUrl(exercise.image_url)}
          imageAuthor={exercise.image_author}
        />
      </View>

      {/* 3 chip row */}
      <View style={styles.chipRow}>
        <ChipCard label="PRIMARY" value={primary} />
        <ChipCard label="SECONDARY" value={secondary} />
        <ChipCard label="EQUIP" value={exercise.equipment} />
      </View>

      <Text style={styles.sectionLabel}>HOW TO</Text>

      {steps.length === 0 ? (
        <Text style={styles.emptyStep}>No instructions yet.</Text>
      ) : (
        <View style={styles.steps}>
          {steps.map((text, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{text}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ChipCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Set-index glyph: letter for warmup/drop/failure, working-set index otherwise. */
function setIndex(sets: HistorySetOut[], i: number): string {
  const s = sets[i];
  if (s.type === 'warmup') return 'W';
  if (s.type === 'drop') return 'D';
  if (s.type === 'failure') return 'F';
  let n = 0;
  for (let k = 0; k <= i; k += 1) {
    if (sets[k].type !== 'warmup') n += 1;
  }
  return String(n);
}

function fmtSetValue(s: HistorySetOut): string {
  const reps = s.reps ?? 0;
  if (s.weight == null) return `BW × ${reps}`;
  return `${s.weight} kg × ${reps}`;
}

function HistoryTab({ history }: { history: HistorySessionOut[] }) {
  if (history.length === 0) {
    return <Text style={styles.emptyHistory}>No history yet.</Text>;
  }
  return (
    <View style={styles.historyCol}>
      {history.map((session) => (
        <View key={session.workout_id} style={styles.sessionCard}>
          <View style={styles.sessionHeader}>
            <Text style={styles.sessionDate}>{fmtDateOnly(session.date)}</Text>
            {session.has_pr ? (
              <View style={styles.prPill}>
                <StarIcon size={13} color={color.success} strokeWidth={2.4} />
                <Text style={styles.prText}>PR</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.sessionSets}>
            {session.sets.map((s, i) => (
              <View key={`${s.position}-${i}`} style={styles.setRow}>
                <Text style={styles.setIdx}>{setIndex(session.sets, i)}</Text>
                <Text style={styles.setValue}>{fmtSetValue(s)}</Text>
                {s.is_pr ? (
                  <View style={styles.bestPill}>
                    <Text style={styles.bestText}>BEST</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

function ChartsTab({ records, charts }: { records: RecordOut[]; charts: ChartOut[] }) {
  const byMetric = useMemo(() => {
    const m: Partial<Record<RecordMetric, RecordOut>> = {};
    for (const r of records) m[r.metric] = r;
    return m;
  }, [records]);
  const chartFor = useMemo(() => {
    const m: Partial<Record<RecordMetric, ChartOut>> = {};
    for (const c of charts) m[c.metric] = c;
    return m;
  }, [charts]);

  const rows: RecordMetric[][] = [
    [CHART_METRICS[0], CHART_METRICS[1]],
    [CHART_METRICS[2], CHART_METRICS[3]],
  ];

  return (
    <View>
      <View style={styles.recordsGrid}>
        {rows.map((row, ri) => (
          <View key={ri} style={styles.recordsRow}>
            {row.map((metric) => (
              <RecordCard key={metric} metric={metric} record={byMetric[metric]} />
            ))}
          </View>
        ))}
      </View>

      {/* One chart per metric — the same card, fed each metric's series. */}
      {CHART_METRICS.map((metric) => (
        <View key={metric} style={styles.chartBlock}>
          <Text style={styles.sectionLabel}>
            {`${RECORD_LABELS[metric]} · LAST ${CHART_SESSIONS} SESSIONS`}
          </Text>
          <View style={styles.chartCard}>
            <View style={styles.chartRegion}>
              <MiniChart
                values={chartFor[metric]?.values ?? []}
                labels={chartFor[metric]?.labels ?? []}
                unit={CHART_UNIT[metric]}
              />
            </View>
            <View style={styles.chartLabels}>
              {(chartFor[metric]?.labels ?? []).map((l, i) => (
                <Text key={`${l}-${i}`} style={styles.chartLabel}>
                  {l}
                </Text>
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function RecordCard({ metric, record }: { metric: RecordMetric; record?: RecordOut }) {
  return (
    <View style={styles.recordCard}>
      <Text style={styles.recordLabel}>{RECORD_LABELS[metric]}</Text>
      <Text style={styles.recordValue}>{record?.display ?? '—'}</Text>
    </View>
  );
}

/** Trailing-zero-free number: 68.0 -> "68", 20.5 -> "20.5", 1740 -> "1,740". */
function fmtChartValue(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const TOOLTIP_W = 132;

/**
 * Line + dots chart, normalized to its own min..max. Tapping a point (or the
 * column above it) reveals a tooltip with that session's value and date — the
 * only place the actual numbers are shown, since the axis is dates only.
 */
function MiniChart({
  values,
  labels,
  unit,
}: {
  values: number[];
  labels: string[];
  unit: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  const W = 320;
  const H = 150;
  const padX = 8;
  const padY = 8;

  if (values.length < 2) {
    return <Text style={styles.chartEmpty}>Not enough data yet.</Text>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (W - padX * 2) / (values.length - 1);

  const pts = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = H - padY - ((v - min) / range) * (H - padY * 2);
    return { x, y };
  });

  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  // The Svg stretches to fill (preserveAspectRatio="none"), so viewBox x scales
  // by width/W and y is 1:1 (region height == H).
  const selected =
    sel != null && width > 0
      ? {
          xpx: (pts[sel].x / W) * width,
          ypx: pts[sel].y,
          left: Math.max(0, Math.min(width - TOOLTIP_W, (pts[sel].x / W) * width - TOOLTIP_W / 2)),
        }
      : null;

  return (
    <View style={styles.flex} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path
          d={d}
          fill="none"
          stroke={color.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === sel ? 5 : 3}
            fill={i === sel ? color.text1 : color.accent}
          />
        ))}
      </Svg>

      {/* One tap column per point — larger, reliable targets over the tiny dots. */}
      <View style={styles.chartTapRow}>
        {values.map((_, i) => (
          <Pressable
            key={i}
            style={styles.flex}
            onPress={() => setSel((cur) => (cur === i ? null : i))}
            accessibilityRole="button"
            accessibilityLabel={`${labels[i] ?? `Point ${i + 1}`}: ${fmtChartValue(values[i])} ${unit}`}
          />
        ))}
      </View>

      {selected && (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            { left: selected.left, width: TOOLTIP_W, bottom: H - selected.ypx + 12 },
          ]}
        >
          <Text style={styles.tooltipValue}>{`${fmtChartValue(values[sel!])} ${unit}`}</Text>
          <Text style={styles.tooltipLabel}>{labels[sel!] ? fmtDateOnly(labels[sel!]) : ''}</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  loading: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },

  // Header ------------------------------------------------------------
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.9)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.text1,
    maxWidth: 220,
    textAlign: 'center',
  },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: {
    flex: 1,
    height: 42,
    borderBottomWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    fontFamily: font.titleSemi,
    fontSize: 13.5,
  },

  // About -------------------------------------------------------------
  demoWrap: {
    marginBottom: 18,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 22,
  },
  chip: {
    flex: 1,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 13,
    padding: 12,
  },
  chipLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9,
    letterSpacing: 0.9,
    color: color.text3,
    marginBottom: 6,
  },
  chipValue: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },
  sectionLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    marginBottom: 12,
  },
  emptyStep: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text3,
  },
  steps: {
    flexDirection: 'column',
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepBadgeText: {
    fontFamily: font.monoSemi,
    fontSize: 12,
    color: color.accent,
  },
  stepText: {
    flex: 1,
    fontFamily: font.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    color: color.text2,
    paddingTop: 2,
  },

  // History -----------------------------------------------------------
  emptyHistory: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text3,
    textAlign: 'center',
    paddingVertical: 40,
  },
  historyCol: {
    flexDirection: 'column',
    gap: 12,
  },
  sessionCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionDate: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },
  prPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  prText: {
    fontFamily: font.monoSemi,
    fontSize: 11,
    color: color.success,
  },
  sessionSets: {
    flexDirection: 'column',
    gap: 6,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setIdx: {
    width: 20,
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
  },
  setValue: {
    fontFamily: font.monoMedium,
    fontSize: 14,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  bestPill: {
    borderWidth: 1,
    borderColor: 'rgba(255,74,28,0.3)',
    borderRadius: 5,
    paddingVertical: 1,
    paddingHorizontal: 5,
  },
  bestText: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.accent,
  },

  // Charts ------------------------------------------------------------
  recordsGrid: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 22,
  },
  recordsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  recordCard: {
    flex: 1,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 14,
    padding: 14,
  },
  recordLabel: {
    fontFamily: font.monoRegular,
    fontSize: 9,
    letterSpacing: 0.9,
    color: color.text3,
    marginBottom: 8,
  },
  recordValue: {
    fontFamily: font.monoSemi,
    fontSize: 22,
    letterSpacing: -0.44,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  chartBlock: {
    marginBottom: 22,
  },
  chartCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  chartRegion: {
    height: 150,
  },
  chartTapRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tooltip: {
    position: 'absolute',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: color.surface3,
    borderWidth: 1,
    borderColor: color.border,
  },
  tooltipValue: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  tooltipLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.text3,
    marginTop: 1,
  },
  chartEmpty: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text3,
    textAlign: 'center',
    paddingVertical: 60,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 2,
  },
  chartLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.text3,
  },
});
