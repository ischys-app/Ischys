/**
 * 1RM calculator (#71).
 *
 * Reached two ways: from an exercise's EST. 1RM record card, pre-filled with
 * that set and naming where it came from, or standalone from Profile → TOOLS
 * with empty fields.
 *
 * It uses the same Epley as `domain/stats`, so it can never disagree with the
 * EST. 1RM record. Everything here is labelled an estimate and none of it is
 * ever shown as a PR. There is no primary action, so no accent beyond the
 * existing focus border on an input.
 *
 * The weight is typed and shown in the user's unit and the sums are done in
 * kilograms, like everywhere else; the table rounds to loads that exist in
 * that unit (see `domain/loadRounding`).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackChevronIcon } from '../src/components/icons';
import { estimateTier, percentageTable, type EstimateTier } from '../src/domain/oneRepMax';
import { percentageRounder } from '../src/domain/loadRounding';
import { defaultBarSetup, type BarSetup } from '../src/domain/plateMath';
import { estimated1rm } from '../src/domain/stats';
import {
  WEIGHT_STEPS,
  convertWeightText,
  parseWeight,
  toKg,
  weightText,
} from '../src/domain/units';
import { getPlateSetup } from '../src/lib/plateSetup';
import { useWeightUnit } from '../src/lib/weightUnit';
import { color, font } from '../src/theme/tokens';

const TIER_COPY: Record<EstimateTier, { label: string; note: string }> = {
  close: {
    label: 'Close',
    note: 'Low-rep sets give the most reliable estimate.',
  },
  reasonable: {
    label: 'Reasonable',
    note: 'Good enough to plan from. A set under 6 reps would sharpen it.',
  },
  rough: {
    label: 'Rough',
    note: 'Past 10 reps this says more about your rep tolerance than your one-rep max. Log a set of 5 or fewer for a number worth planning from.',
  },
};

export default function OneRepMaxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // `weight`/`reps` pre-fill from a record card; `from` names its exercise.
  // The record's weight arrives in kilograms, as stored.
  const params = useLocalSearchParams<{ weight?: string; reps?: string; from?: string }>();
  const unit = useWeightUnit();

  // The field holds text in `typedIn`. That is the user's unit, except for the
  // one render in which the preference has just changed and the text has not
  // been re-expressed yet — which is done here, before anything reads it.
  const [typedIn, setTypedIn] = useState(unit);
  const [weight, setWeight] = useState(() => weightText(parseWeight(params.weight), unit));
  const [reps, setReps] = useState(params.reps ?? '');
  const [setup, setSetup] = useState<BarSetup>(() => defaultBarSetup(unit));
  if (typedIn !== unit) {
    setTypedIn(unit);
    setWeight(convertWeightText(weight, typedIn, unit));
  }
  // Only an exercise known to be barbell rounds to plates; standalone use and
  // every other equipment gets the unit's plain step (2.5 kg / 5 lb).
  const barbell = params.from != null && params.weight != null;

  useEffect(() => {
    let alive = true;
    void getPlateSetup(unit).then((s) => {
      if (alive) setSetup(s);
    });
    return () => {
      alive = false;
    };
  }, [unit]);

  // Epley is a plain multiple of the weight, so it is taken in the unit the
  // number was typed in and only then turned into kilograms for the table.
  // Estimating from the stored kilograms instead would round twice, and 135 lb
  // for a single would come back as 135.01.
  const typed = parseWeight(weight);
  const repsValue = parseInt(reps, 10);
  const estimate = estimated1rm(typed, Number.isFinite(repsValue) ? repsValue : null);
  const estimateKg = toKg(estimate, typedIn);
  const tier = estimateTier(repsValue);
  const rough = tier === 'rough';

  const round = useMemo(() => percentageRounder(barbell, setup, unit), [barbell, setup, unit]);

  const rows = useMemo(
    () => (estimateKg ? percentageTable(estimateKg, { round }) : []),
    [estimateKg, round],
  );

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
        <Text style={styles.title}>1RM calculator</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        {!!params.from && <Text style={styles.from}>From {params.from}</Text>}

        <View style={styles.inputs}>
          <Field label="WEIGHT" value={weight} onChange={setWeight} suffix={unit} decimal />
          <Field label="REPS" value={reps} onChange={setReps} suffix="reps" />
        </View>

        <View style={[styles.estimate, rough && styles.estimateRough]}>
          <Text style={styles.estimateLabel}>ESTIMATED 1RM</Text>
          <Text style={styles.estimateValue}>
            {estimate ? `${rough ? '≈ ' : ''}${estimate} ${unit}` : '—'}
          </Text>
          {tier && (
            <>
              <Text style={[styles.tier, rough && styles.tierRough]}>{TIER_COPY[tier].label}</Text>
              <Text style={styles.note}>{TIER_COPY[tier].note}</Text>
            </>
          )}
          {!tier && <Text style={styles.note}>Enter a weight and a rep count.</Text>}
        </View>

        {rows.length > 0 && (
          <View style={[styles.table, rough && styles.tableRough]}>
            <View style={styles.tableHead}>
              <Text style={[styles.headCell, styles.colPct]}>%</Text>
              <Text style={[styles.headCell, styles.colLoad]}>LOAD</Text>
              <Text style={[styles.headCell, styles.colReps]}>≈ REPS</Text>
            </View>
            {rows.map((r) => (
              <View key={r.pct} style={styles.row}>
                <Text style={[styles.cell, styles.colPct]}>{r.pct}%</Text>
                <Text style={[styles.cell, styles.colLoad, styles.cellStrong]}>{weightText(r.kg, unit)} {unit}</Text>
                <Text style={[styles.cell, styles.colReps]}>{r.reps ?? ''}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footnote}>
          An estimate, never a personal record. {barbell ? 'Loads round to your plates.' : `Loads round to ${WEIGHT_STEPS[unit].bar} ${unit}.`}
        </Text>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  decimal,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  suffix: string;
  decimal?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldBox, focused && styles.fieldBoxFocused]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          placeholder="—"
          placeholderTextColor={color.text3}
          style={styles.fieldInput}
        />
        <Text style={styles.fieldSuffix}>{suffix}</Text>
      </View>
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
  from: { fontFamily: font.bodyRegular, fontSize: 13, color: color.text2, marginBottom: 12 },

  inputs: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  fieldLabel: {
    fontFamily: font.monoMedium,
    fontSize: 11,
    letterSpacing: 0.5,
    color: color.text3,
    marginBottom: 6,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
  },
  // The one accent on this screen, and it's the shipped focus treatment rather
  // than a new one — there is no primary action here to claim it.
  fieldBoxFocused: { borderColor: color.accent },
  fieldInput: { flex: 1, fontFamily: font.monoMedium, fontSize: 22, color: color.text1, padding: 0 },
  fieldSuffix: { fontFamily: font.monoRegular, fontSize: 13, color: color.text3, marginLeft: 6 },

  estimate: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
  },
  estimateRough: { borderColor: color.warning },
  estimateLabel: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.5, color: color.text3 },
  estimateValue: { fontFamily: font.monoSemi, fontSize: 38, color: color.text1, marginTop: 6 },
  tier: { fontFamily: font.bodyMedium, fontSize: 14, color: color.text2, marginTop: 4 },
  tierRough: { color: color.warning },
  note: { fontFamily: font.bodyRegular, fontSize: 13, lineHeight: 19, color: color.text3, marginTop: 6 },

  table: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    overflow: 'hidden',
  },
  // Dimmed rather than hidden: the numbers are still the honest consequence of
  // what was typed, they just shouldn't be planned from.
  tableRough: { opacity: 0.5 },
  tableHead: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headCell: { fontFamily: font.monoMedium, fontSize: 11, letterSpacing: 0.5, color: color.text3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hair,
  },
  cell: { fontFamily: font.monoRegular, fontSize: 14, color: color.text2 },
  cellStrong: { fontFamily: font.monoMedium, color: color.text1 },
  colPct: { width: 60 },
  colLoad: { flex: 1 },
  colReps: { width: 70, textAlign: 'right' },

  footnote: { fontFamily: font.bodyRegular, fontSize: 12, color: color.text3, marginTop: 14 },
});
