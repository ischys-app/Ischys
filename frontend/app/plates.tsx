/**
 * Bar & plates (#64, board PC3) — what this gym actually has, so the plate
 * calculator only proposes loads the user can build.
 *
 * Reached from Settings → TRAINING and from the bar chip in the plate sheet.
 * Stored in SecureStore (see `lib/plateSetup`), not the settings table: it
 * describes a place, not the account.
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChevronIcon } from '../src/components/icons';
import { SectionLabel } from '../src/components/SectionLabel';
import { BAR_OPTIONS, defaultBarSetup, setupUnit, type BarSetup } from '../src/domain/plateMath';
import { getPlateSetup, setPlateSetup } from '../src/lib/plateSetup';
import { useWeightUnit } from '../src/lib/weightUnit';
import { color, font } from '../src/theme/tokens';

const fmt = (n: number): string => String(Math.round(n * 100) / 100);

export default function PlatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Each unit has its own rack: a pound user edits pound plates here, and the
  // kg setup is left exactly as it was for when they switch back.
  const userUnit = useWeightUnit();
  const [setup, setSetup] = useState<BarSetup>(() => defaultBarSetup(userUnit));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPlateSetup(userUnit).then((s) => {
      if (!alive) return;
      setSetup(s);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [userUnit]);

  // Labels follow the setup on screen, not the preference, so a number is
  // never shown under a unit it isn't in while a load is still landing.
  const unit = setupUnit(setup);

  /** Write through on every change — there is no Save button to forget. */
  const commit = (next: BarSetup) => {
    setSetup(next);
    void setPlateSetup(next);
  };

  const setCount = (kg: number, count: number) =>
    commit({
      ...setup,
      pairs: setup.pairs.map((p) => (p.kg === kg ? { ...p, count: Math.max(0, count) } : p)),
    });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <BackChevronIcon color={color.text1} />
        </Pressable>
        <Text style={styles.title}>Bar &amp; plates</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <SectionLabel>BAR</SectionLabel>
        <View style={styles.card}>
          <View style={styles.segment}>
            {BAR_OPTIONS[unit].map((kg) => {
              const on = setup.barKg === kg;
              return (
                <Pressable
                  key={kg}
                  onPress={() => commit({ ...setup, barKg: kg })}
                  style={[styles.segmentItem, on && styles.segmentItemOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{kg} {unit}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <SectionLabel>PLATES · PAIRS</SectionLabel>
        <View style={styles.card}>
          {setup.pairs.map((p, i) => (
            <View
              key={p.kg}
              style={[styles.plateRow, i === setup.pairs.length - 1 && styles.plateRowLast]}
            >
              <Text style={styles.plateKg}>{fmt(p.kg)} {unit}</Text>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setCount(p.kg, p.count - 1)}
                  hitSlop={8}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`One fewer pair of ${fmt(p.kg)} ${unit} plates`}
                >
                  <Text style={styles.stepGlyph}>−</Text>
                </Pressable>
                <Text style={[styles.stepCount, p.count === 0 && styles.stepCountOff]}>
                  {p.count}
                </Text>
                <Pressable
                  onPress={() => setCount(p.kg, p.count + 1)}
                  hitSlop={8}
                  style={styles.stepBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`One more pair of ${fmt(p.kg)} ${unit} plates`}
                >
                  <Text style={styles.stepGlyph}>+</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>Set a plate to 0 if your gym doesn&apos;t have it.</Text>

        {loaded && (
          <Pressable
            onPress={() => commit(defaultBarSetup(unit))}
            style={styles.reset}
            accessibilityRole="button"
          >
            <Text style={styles.resetText}>Reset to a standard set</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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

  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },

  segment: { flexDirection: 'row', padding: 6, gap: 6 },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Selected uses surface3, matching the shipped Units segment — the accent on
  // this screen would compete with nothing and mean nothing.
  segmentItemOn: { backgroundColor: color.surface3 },
  segmentText: { fontFamily: font.monoMedium, fontSize: 14, color: color.text2 },
  segmentTextOn: { color: color.text1 },

  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    height: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hair,
  },
  plateRowLast: { borderBottomWidth: 0 },
  plateKg: { fontFamily: font.monoMedium, fontSize: 15, color: color.text1 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface2,
  },
  stepGlyph: { fontFamily: font.titleSemi, fontSize: 18, color: color.text1, lineHeight: 22 },
  stepCount: {
    fontFamily: font.monoSemi,
    fontSize: 16,
    color: color.text1,
    minWidth: 30,
    textAlign: 'center',
  },
  stepCountOff: { color: color.text3 },

  hint: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text3, marginTop: -8 },

  reset: { marginTop: 28, alignItems: 'center', paddingVertical: 12 },
  resetText: { fontFamily: font.bodyMedium, fontSize: 14, color: color.text2 },
});
