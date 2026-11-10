/**
 * Muscle map (#66) — front and back, tinted by how much each region has been
 * worked, with a breakdown on tap.
 *
 * The question it answers is "what am I neglecting", so the figure is not
 * heat-mapped: worked muscles climb a neutral grey ramp and the untouched ones
 * are what stand out, outlined in warning.
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BodyMap } from '../src/components/BodyMap';
import { DraggableSheet } from '../src/components/DraggableSheet';
import { BackChevronIcon } from '../src/components/icons';
import { SectionLabel } from '../src/components/SectionLabel';
import {
  aggregateMuscleWork,
  tintFor,
  isNeglected,
  type MuscleRegion,
  type MuscleWorkEntry,
} from '../src/domain/muscleMap';
import { muscleWorkEntries } from '../src/data/muscleMapRepo';
import { color, font, themed } from '../src/theme/tokens';
import { useThemed } from '../src/theme/ThemeProvider';
import { localizeNumber } from '../src/domain/units';
import { getLang } from '../src/i18n/current';
import { muscleNameLabel } from '../src/i18n/catalogNames';
import { t } from '../src/i18n';

const WINDOWS = [
  { days: 7 as const, key: 'muscleMap.days7' },
  { days: 28 as const, key: 'muscleMap.days28' },
];

const fmtSets = (n: number): string => (Number.isInteger(n) ? String(n) : localizeNumber(n.toFixed(1)));

export default function MuscleMapScreen() {
  useThemed();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [windowDays, setWindowDays] = useState<7 | 28>(7);
  const [entries, setEntries] = useState<MuscleWorkEntry[]>([]);
  const [historyDays, setHistoryDays] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void muscleWorkEntries(windowDays)
      .then((r) => {
        if (!alive) return;
        setEntries(r.entries);
        setHistoryDays(r.historyDays);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [windowDays]);

  const work = useMemo(
    () => aggregateMuscleWork({ entries, windowDays, today: new Date() }),
    [entries, windowDays],
  );

  const neglected = useMemo(
    () => [...work.entries()].filter(([, sets]) => isNeglected(sets, historyDays, false)).map(([r]) => r),
    [work, historyDays],
  );

  // `work` is keyed by MuscleRegion; the diagram hands back the same strings,
  // so the cast is a narrowing, not an assumption.
  const selectedSets = selected ? (work.get(selected as MuscleRegion) ?? 0) : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back} accessibilityRole="button">
          <BackChevronIcon color={color.text1} />
        </Pressable>
        <Text style={styles.title}>{t('muscleMap.title')}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={styles.segment}>
          {WINDOWS.map((w) => {
            const on = w.days === windowDays;
            return (
              <Pressable
                key={w.days}
                onPress={() => setWindowDays(w.days)}
                style={[styles.segmentItem, on && styles.segmentItemOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t(w.key)}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.scaleNote}>
          {windowDays === 28 ? t('muscleMap.scale28') : t('muscleMap.scale7')}
        </Text>

        <View style={styles.figures}>
          <View style={styles.figure}>
            <BodyMap side="front" work={work} historyDays={historyDays} onPressRegion={setSelected} width={150} />
            <Text style={styles.figureLabel}>{t('muscleMap.front')}</Text>
          </View>
          <View style={styles.figure}>
            <BodyMap side="back" work={work} historyDays={historyDays} onPressRegion={setSelected} width={150} />
            <Text style={styles.figureLabel}>{t('muscleMap.back')}</Text>
          </View>
        </View>

        <View style={styles.legend}>
          {(['none', 'low', 'medium', 'high'] as const).map((tier) => (
            <View key={tier} style={styles.legendItem}>
              <View
                style={[
                  styles.legendSwatch,
                  {
                    backgroundColor:
                      tier === 'none' ? color.surface3 : tier === 'low' ? color.text3 : tier === 'medium' ? color.text2 : color.text1,
                  },
                ]}
              />
              <Text style={styles.legendText}>
                {tier === 'none' ? '0' : tier === 'low' ? '<5' : tier === 'medium' ? '5–9' : '10+'}
              </Text>
            </View>
          ))}
        </View>

        {neglected.length > 0 && (
          <>
            <SectionLabel style={styles.sectionLabel}>{t('muscleMap.notTrained')}</SectionLabel>
            <View style={styles.card}>
              <Text style={styles.neglectedText}>
                {neglected.map((r) => muscleNameLabel(r, getLang())).join(' · ')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <DraggableSheet visible={selected != null} onClose={() => setSelected(null)} sheetStyle={styles.sheet}>
        <View style={styles.grabberWrap}>
          <View style={styles.grabber} />
        </View>
        <Text style={styles.sheetTitle}>{selected ? muscleNameLabel(selected, getLang()) : ''}</Text>
        <Text style={styles.sheetValue}>
          {t(windowDays === 28 ? 'muscleMap.setsPerWeek' : 'muscleMap.sets', { n: fmtSets(selectedSets) })}
        </Text>
        <Text style={styles.sheetNote}>
          {selectedSets === 0
            ? historyDays >= 14
              ? t('muscleMap.noneLogged')
              : t('muscleMap.notEnough')
            : t('muscleMap.counts', { tint: t(`muscleMap.tint.${tintFor(selectedSets)}`) })}
        </Text>
      </DraggableSheet>
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

    segment: { flexDirection: 'row', backgroundColor: color.surface2, borderRadius: 9, padding: 3, gap: 3 },
    segmentItem: { flex: 1, height: 34, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    segmentItemOn: { backgroundColor: color.surface3 },
    segmentText: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.5, color: color.text2 },
    segmentTextOn: { color: color.text1 },
    scaleNote: { fontFamily: font.bodyRegular, fontSize: 12, color: color.text3, marginTop: 8 },

    figures: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
    figure: { alignItems: 'center', gap: 8 },
    figureLabel: { fontFamily: font.monoMedium, fontSize: 10, letterSpacing: 1.2, color: color.text3 },

    legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 20 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendSwatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3 },

    sectionLabel: { marginTop: 24, marginBottom: 8 },
    card: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 12,
      padding: 14,
    },
    neglectedText: { fontFamily: font.bodyRegular, fontSize: 14, lineHeight: 21, color: color.warning },

    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingBottom: 28,
    },
    grabberWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
    grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: color.surface3 },
    sheetTitle: { fontFamily: font.titleSemi, fontSize: 20, color: color.text1 },
    sheetValue: { fontFamily: font.monoSemi, fontSize: 28, color: color.text1, marginTop: 6 },
    sheetNote: { fontFamily: font.bodyRegular, fontSize: 13, lineHeight: 19, color: color.text3, marginTop: 8 },
  }),
);
