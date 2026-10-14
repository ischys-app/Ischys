/**
 * One measurement's history (#65) — a time-axis chart and every reading.
 *
 * The source tag is on every entry, because a value that came from Health and
 * one you measured yourself are not the same claim, and the app should not
 * blur them.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { BackChevronIcon } from '../../src/components/icons';
import { axisTicks, gapKind } from '../../src/domain/chartRange';
import {
  deltaBetween,
  formatMeasurement,
  METRICS,
  type MetricId,
} from '../../src/domain/measurements';
import { measurementHistory, type MeasurementRow } from '../../src/data/measurementsRepo';
import { getSettings } from '../../src/api/workouts';
import { fmtDateOnly } from '../../src/lib/format';
import { color, font, themed } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

const W = 320;
const H = 140;
const PAD = 10;

export default function MeasurementHistoryScreen() {
  useThemed();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ metric: string }>();
  const metric = (METRICS.includes(params.metric as MetricId) ? params.metric : 'waist') as MetricId;

  const [rows, setRows] = useState<MeasurementRow[]>([]);
  const [prefs, setPrefs] = useState<{ weightUnit: 'kg' | 'lb' }>({ weightUnit: 'kg' });

  useEffect(() => {
    let alive = true;
    void Promise.all([measurementHistory(metric), getSettings().catch(() => null)]).then(
      ([history, settings]) => {
        if (!alive) return;
        setRows(history);
        if (settings?.unit === 'lb' || settings?.unit === 'kg') setPrefs({ weightUnit: settings.unit });
      },
    );
    return () => {
      alive = false;
    };
  }, [metric]);

  const chart = useMemo(() => {
    if (rows.length < 2) return null;
    const times = rows.map((r) => r.measuredAt);
    const values = rows.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const tSpan = times[times.length - 1] - times[0] || 1;
    const pts = rows.map((r, i) => ({
      // Placed by date, like the exercise charts: measurements are taken
      // irregularly, and even spacing would hide the gaps entirely.
      x: PAD + ((times[i] - times[0]) / tSpan) * (W - PAD * 2),
      y: H - PAD - ((values[i] - min) / span) * (H - PAD * 2),
    }));
    const legs = pts.slice(1).map((p, i) => ({
      d: `M${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      gap: gapKind(times[i + 1] - times[i]),
    }));
    return { pts, legs, times };
  }, [rows]);

  const newest = rows[rows.length - 1];
  const older = rows[rows.length - 2];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button">
          <BackChevronIcon color={color.text1} />
        </Pressable>
        <Text style={styles.title}>{metric === 'bodyFat' ? 'Body fat' : metric[0].toUpperCase() + metric.slice(1)}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.headline}>
          <Text style={styles.headlineValue}>
            {newest ? formatMeasurement(newest.value, metric, prefs) : '—'}
          </Text>
          {older && newest ? (
            <Text style={styles.headlineDelta}>
              {deltaBetween(older.value, newest.value, metric, prefs)} since last
            </Text>
          ) : null}
        </View>

        {chart ? (
          <View style={styles.chartCard}>
            <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              {chart.legs.map((leg, i) => (
                <Path
                  key={i}
                  d={leg.d}
                  fill="none"
                  stroke={leg.gap === 'none' ? color.accent : color.text3}
                  strokeWidth={2}
                  strokeDasharray={leg.gap === 'none' ? undefined : '4 4'}
                  strokeLinecap="round"
                />
              ))}
              {chart.pts.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color.accent} />
              ))}
            </Svg>
            <View style={styles.axis}>
              {axisTicks(chart.times, 'ALL').map((t, i) => (
                <Text key={i} style={[styles.axisTick, { left: `${t.pct}%` }]}>
                  {t.label}
                </Text>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.empty}>Log this twice to see it over time.</Text>
        )}

        <View style={styles.card}>
          {[...rows].reverse().map((r, i) => (
            <View key={r.id} style={[styles.row, i === 0 && styles.rowFirst]}>
              <Text style={styles.rowDate}>{fmtDateOnly(new Date(r.measuredAt).toISOString())}</Text>
              <View style={styles.rowRight}>
                {/* Named on every entry: a Health reading and one you took are
                    different claims. */}
                <Text style={styles.sourceTag}>{r.source === 'health' ? 'HEALTH' : 'MANUAL'}</Text>
                <Text style={styles.rowValue}>{formatMeasurement(r.value, metric, prefs)}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    title: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
    content: { paddingHorizontal: 16 },

    headline: { gap: 4, marginBottom: 16 },
    headlineValue: { fontFamily: font.monoSemi, fontSize: 36, color: color.text1 },
    headlineDelta: { fontFamily: font.monoRegular, fontSize: 13, color: color.text2 },

    chartCard: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    axis: { height: 16, marginTop: 6 },
    axisTick: {
      position: 'absolute',
      top: 0,
      fontFamily: font.monoRegular,
      fontSize: 10,
      color: color.text3,
    },
    empty: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, marginBottom: 16 },

    card: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      height: 48,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: color.hair,
    },
    rowFirst: { borderTopWidth: 0 },
    rowDate: { fontFamily: font.bodyRegular, fontSize: 14, color: color.text2 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sourceTag: {
      fontFamily: font.monoMedium,
      fontSize: 9,
      letterSpacing: 0.5,
      color: color.text3,
      backgroundColor: color.surface3,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    rowValue: { fontFamily: font.monoMedium, fontSize: 15, color: color.text1 },
  }),
);
