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
import Svg, { Circle, Path, Rect } from 'react-native-svg';

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
import { CheckIcon, PlusIcon, StarIcon } from '../../src/components/icons';
import { fmtDateOnly } from '../../src/lib/format';
import { accentA, color, font } from '../../src/theme/tokens';
import {
  axisTicks,
  CHART_RANGES,
  gapKind,
  rangeSince,
  trendPerMonth,
  type ChartRangeId,
} from '../../src/domain/chartRange';
import { getChartRange, setChartRange } from '../../src/lib/chartRangePref';
import { recordDisplay } from '../../src/domain/records';
import { type Unit, formatWeight, volumeToDisplay } from '../../src/domain/units';
import { useWeightUnit } from '../../src/lib/weightUnit';
import { PressableScale } from '../../src/components/PressableScale';
import { pickerIsActive, pickerIsSelected, pickerToggle } from '../../src/lib/exercisePicker';

type TabKey = 'about' | 'history' | 'charts';

const RECORD_LABELS: Record<RecordMetric, string> = {
  best_set: 'BEST SET',
  est_1rm: 'EST. 1RM',
  best_volume: 'BEST VOLUME',
  max_reps: 'MAX REPS',
};

/** Metrics charted over the last sessions, in the order shown on the Charts tab. */
const CHART_METRICS: RecordMetric[] = ['best_set', 'est_1rm', 'best_volume', 'max_reps'];


/** Unit shown in a point's tooltip; reps for max_reps, the user's weight unit otherwise. */
const chartUnit = (metric: RecordMetric, unit: Unit): string =>
  metric === 'max_reps' ? 'reps' : unit;

export default function ExerciseDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; pick?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [tab, setTab] = useState<TabKey>('about');
  const [exercise, setExercise] = useState<ExerciseOut | null>(null);
  const [history, setHistory] = useState<HistorySessionOut[]>([]);
  const [records, setRecords] = useState<RecordOut[]>([]);
  const [charts, setCharts] = useState<ChartOut[]>([]);
  const [range, setRange] = useState<ChartRangeId | null>(null);

  useEffect(() => {
    let alive = true;
    void getChartRange().then((r) => {
      if (alive) setRange(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Charts reload on range change, separately from the rest of the screen —
  // switching to 1Y must not blank the records or the history above them.
  useEffect(() => {
    if (!id || !range) return;
    let cancelled = false;
    const since = rangeSince(range);
    void Promise.all(
      CHART_METRICS.map((metric) =>
        getExerciseChart(id, metric, { since }).catch(
          () => ({ metric, labels: [], values: [], times: [] }) as ChartOut,
        ),
      ),
    ).then((chs) => {
      if (!cancelled) setCharts(chs);
    });
    return () => {
      cancelled = true;
    };
  }, [id, range]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [ex, hist, recs] = await Promise.all([
          getExercise(id),
          getExerciseHistory(id).catch(() => [] as HistorySessionOut[]),
          getExerciseRecords(id).catch(() => [] as RecordOut[]),
        ]);
        if (cancelled) return;
        setExercise(ex);
        setHistory(hist);
        setRecords(recs);
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

  // Opened from the Add Exercise picker: offer to select, rather than only
  // describe. Browse mode gets no bar, because there is nothing to add to.
  // `pickerIsActive` is the real gate — the param alone could outlive the
  // picker if this screen were restored on its own.
  const picking = params.pick === '1' && pickerIsActive();
  const [isPicked, setIsPicked] = useState(false);
  useEffect(() => {
    if (picking && id) setIsPicked(pickerIsSelected(id));
  }, [picking, id]);

  const onPickPress = () => {
    if (!exercise) return;
    pickerToggle(exercise);
    // Selecting takes you back to keep adding; removing stays put, since you
    // are probably reading the screen to decide.
    if (!isPicked) {
      router.back();
      return;
    }
    setIsPicked(false);
  };

  const title = exercise?.name ?? (loading ? 'Loading' : 'Exercise');

  return (
    <View style={styles.root}>
      {/* SCROLL — sits behind the absolutely-positioned header. */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={{
          paddingTop: 152 + insets.top,
          paddingHorizontal: 16,
          paddingBottom: (picking ? 116 : 32) + insets.bottom,
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
          <ChartsTab
            records={records}
            charts={charts}
            exerciseName={exercise?.name ?? ''}
            range={range}
            onRangeChange={(r) => {
              setRange(r);
              void setChartRange(r);
            }}
          />
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
          {/* Layout spacer only — balances the back button so the title stays
              centred. Not a button: no background, no press target. */}
          <View style={styles.headerSpacer} />
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

      {picking && (
        <View style={[styles.pickBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <PressableScale
            style={[styles.pickButton, isPicked ? styles.pickButtonOn : styles.pickButtonOff]}
            onPress={onPickPress}
            accessibilityRole="button"
          >
            {isPicked ? (
              <>
                <CheckIcon size={16} color={color.accent} strokeWidth={3} />
                <Text style={[styles.pickText, { color: color.text1 }]}>Selected · Remove</Text>
              </>
            ) : (
              <>
                <PlusIcon size={16} color={color.accentFg} strokeWidth={3} />
                <Text style={[styles.pickText, { color: color.accentFg }]}>Select exercise</Text>
              </>
            )}
          </PressableScale>
        </View>
      )}
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

function fmtSetValue(s: HistorySetOut, unit: Unit): string {
  const reps = s.reps ?? 0;
  if (s.weight == null) return `BW × ${reps}`;
  return `${formatWeight(s.weight, unit)} × ${reps}`;
}

function HistoryTab({ history }: { history: HistorySessionOut[] }) {
  const unit = useWeightUnit();
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
                <Text style={styles.setValue}>{fmtSetValue(s, unit)}</Text>
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

function ChartsTab({
  records,
  charts,
  exerciseName,
  range,
  onRangeChange,
}: {
  records: RecordOut[];
  charts: ChartOut[];
  exerciseName: string;
  range: ChartRangeId | null;
  onRangeChange: (r: ChartRangeId) => void;
}) {
  const router = useRouter();
  const unit = useWeightUnit();
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
              <RecordCard
                key={metric}
                metric={metric}
                record={byMetric[metric]}
                // Only EST. 1RM leads anywhere: it's the one record that is an
                // estimate rather than a thing that happened, so it's the one
                // worth opening a calculator on.
                onPress={
                  metric === 'est_1rm' && byMetric.est_1rm?.weight != null
                    ? () =>
                        router.push({
                          pathname: '/one-rep-max',
                          params: {
                            weight: String(byMetric.est_1rm?.weight ?? ''),
                            reps: String(byMetric.est_1rm?.reps ?? ''),
                            from: exerciseName,
                          },
                        })
                    : undefined
                }
              />
            ))}
          </View>
        ))}
      </View>

      {/* One range control for all four charts: comparing metrics only works if
          they're all showing the same window. Selected is surface3, like the
          shipped Units segment — accent would claim an action that isn't here. */}
      <View style={styles.rangeRow}>
        {CHART_RANGES.map((r) => {
          const on = r.id === range;
          return (
            <Pressable
              key={r.id}
              onPress={() => {
                onRangeChange(r.id);
              }}
              style={[styles.rangeItem, on && styles.rangeItemOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* One chart per metric — the same card, fed each metric's series. */}
      {CHART_METRICS.map((metric) => {
        const series = chartFor[metric];
        const times = series?.times ?? [];
        // Series are stored in kilograms (weight or volume); reps are reps.
        // Converted before the trend, so "per month" is in the unit shown too.
        const stored = series?.values ?? [];
        const values =
          metric === 'max_reps' ? stored : stored.map((v) => volumeToDisplay(v, unit));
        const trend =
          times.length === values.length
            ? trendPerMonth(times.map((t, i) => ({ t, value: values[i] })))
            : null;
        return (
          <View key={metric} style={styles.chartBlock}>
            <View style={styles.chartHead}>
              <Text style={styles.sectionLabel}>{RECORD_LABELS[metric]}</Text>
              <Text style={styles.trend}>
                {trend === null
                  ? 'Not enough sessions for a trend'
                  : Math.abs(trend) < 0.05
                    ? '→ flat'
                    : `${trend > 0 ? '↑' : '↓'} ${trend > 0 ? '+' : ''}${
                        Math.round(trend * 10) / 10
                      } ${chartUnit(metric, unit)} / mo`}
              </Text>
            </View>
            <View style={styles.chartCard}>
              <View style={styles.chartRegion}>
                <MiniChart values={values} labels={series?.labels ?? []} times={times} unit={chartUnit(metric, unit)} />
              </View>
              {/* Month (or year) ticks, placed where they fall in time. One
                  label per session stopped working once points were spaced by
                  date — a year of training is fifty-odd dates across a phone. */}
              <View style={styles.chartAxis}>
                {axisTicks(times, range ?? '3M').map((tick, i) => (
                  <Text
                    key={`${tick.label}-${i}`}
                    style={[styles.chartLabel, styles.axisTick, { left: `${tick.pct}%` }]}
                    numberOfLines={1}
                  >
                    {tick.label}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RecordCard({
  metric,
  record,
  onPress,
}: {
  metric: RecordMetric;
  record?: RecordOut;
  onPress?: () => void;
}) {
  const unit = useWeightUnit();
  const body = (
    <>
      <Text style={styles.recordLabel}>{RECORD_LABELS[metric]}</Text>
      <Text style={styles.recordValue}>
        {record ? recordDisplay(metric, record.value, record.display, unit) : '—'}
      </Text>
    </>
  );
  if (!onPress) return <View style={styles.recordCard}>{body}</View>;
  return (
    <Pressable
      style={styles.recordCard}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Open the 1RM calculator with this set"
    >
      {body}
    </Pressable>
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
  times,
  unit,
}: {
  values: number[];
  labels: string[];
  /** Epoch ms per point. Empty falls back to even spacing. */
  times: number[];
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

  // Place points by date when we have them. Even spacing hid the whole point of
  // a long range: three sessions a year apart looked like three in a week.
  const spanMs = times.length === values.length ? times[times.length - 1] - times[0] : 0;
  const byTime = spanMs > 0;
  const pts = values.map((v, i) => {
    const x = byTime
      ? padX + ((times[i] - times[0]) / spanMs) * (W - padX * 2)
      : padX + i * stepX;
    const y = H - padY - ((v - min) / range) * (H - padY * 2);
    return { x, y };
  });

  // Each leg drawn separately so a layoff can be dashed. A single unbroken line
  // across a three-month break claims a continuity that didn't happen.
  const legs = pts.slice(1).map((p, i) => ({
    d: `M${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    gap: byTime ? gapKind(times[i + 1] - times[i]) : ('none' as const),
    x0: pts[i].x,
    x1: p.x,
  }));

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
        {/* A break long enough to matter gets its own band, behind the line. */}
        {legs.map((leg, i) =>
          leg.gap === 'band' ? (
            <Rect
              key={`band-${i}`}
              x={leg.x0}
              y={0}
              width={Math.max(0, leg.x1 - leg.x0)}
              height={H}
              fill={color.surface2}
            />
          ) : null,
        )}
        {legs.map((leg, i) => (
          <Path
            key={`leg-${i}`}
            d={leg.d}
            fill="none"
            stroke={leg.gap === 'none' ? color.accent : color.text3}
            strokeWidth={2}
            strokeDasharray={leg.gap === 'none' ? undefined : '4 4'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
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

      {/* A tap target per point. Once points are placed by date they are no
          longer evenly spaced, so the columns follow them rather than dividing
          the width — otherwise the target drifts away from its own dot. */}
      <View style={styles.chartTapRow} pointerEvents="box-none">
        {values.map((_, i) => {
          const leftPct = (pts[i].x / W) * 100;
          const prevPct = i === 0 ? leftPct : (pts[i - 1].x / W) * 100;
          const nextPct = i === values.length - 1 ? leftPct : (pts[i + 1].x / W) * 100;
          const from = i === 0 ? 0 : (prevPct + leftPct) / 2;
          const to = i === values.length - 1 ? 100 : (leftPct + nextPct) / 2;
          return (
            <Pressable
              key={i}
              style={[styles.tapColumn, { left: `${from}%`, width: `${Math.max(0, to - from)}%` }]}
              onPress={() => setSel((cur) => (cur === i ? null : i))}
              accessibilityRole="button"
              accessibilityLabel={`${labels[i] ?? `Point ${i + 1}`}: ${fmtChartValue(values[i])} ${unit}`}
            />
          );
        })}
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
  headerSpacer: { width: 34, height: 34 },
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
    borderColor: accentA(0.3),
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
  tapColumn: { position: 'absolute', top: 0, bottom: 0 },
  chartAxis: { height: 18, marginTop: 6 },
  axisTick: { position: 'absolute', top: 0 },
  rangeRow: {
    flexDirection: 'row',
    backgroundColor: color.surface2,
    borderRadius: 9,
    padding: 3,
    gap: 3,
    marginBottom: 16,
  },
  rangeItem: { flex: 1, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rangeItemOn: { backgroundColor: color.surface3 },
  rangeText: { fontFamily: font.monoMedium, fontSize: 12, color: color.text2 },
  rangeTextOn: { color: color.text1 },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  // Trends are text2 whichever way they point: a falling lift is information,
  // not an error, and colouring it red would make the chart shout.
  trend: { fontFamily: font.monoRegular, fontSize: 11, color: color.text2 },
  // Sits above the home indicator; content gets 116pt of bottom padding so
  // nothing hides under it.
  pickBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hair,
  },
  pickButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickButtonOff: { backgroundColor: color.accent },
  // Already-selected is a quieter surface: removing is not the action this
  // screen is encouraging.
  pickButtonOn: { backgroundColor: color.surface2 },
  pickText: { fontFamily: font.titleSemi, fontSize: 16 },
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
  chartLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.text3,
  },
});
