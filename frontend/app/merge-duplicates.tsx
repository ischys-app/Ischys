/**
 * Merge duplicate exercises — the same lift saved twice, reunited so no PR is
 * split across two names. One screen carries the whole flow through local
 * `step`: candidates (M2) → choose + preview (M3) → confirm sheet (M4) →
 * merged receipt (M5); an empty library shows the "nothing found" state (M6).
 *
 * Detection + the write are pure/repo concerns (src/lib/mergeDuplicates,
 * src/data/exercisesRepo). This file is presentation only.
 * Design source of truth: design-handoff/.../boards/Merge Duplicates.dc.html (4a).
 */
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ActiveSessionError,
  buildManualGroup,
  countExercises,
  findDuplicateGroups,
  mergeExercises,
  patchExercise,
  type MergeGroupView,
  type MergeMemberView,
  type MergeResult,
} from '../src/api/workouts';
import { DraggableSheet } from '../src/components/DraggableSheet';
import { PressableScale } from '../src/components/PressableScale';
import { reconcilePrs, prMetricLabel, type MergeReason } from '../src/lib/mergeDuplicates';
import { haptics } from '../src/lib/haptics';
import { recordDisplay } from '../src/domain/records';
import { useWeightUnit } from '../src/lib/weightUnit';
import { accentA, color, font } from '../src/theme/tokens';

// --- Local glyphs (icons.tsx is owned by another stream) ------------------

/** Merge glyph: two overlapping circles (board M1/M2/M6). */
function MergeGlyph({ size = 24, color: stroke, strokeWidth = 2 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={8} cy={8} r={5} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
      <Circle cx={16} cy={16} r={5} stroke={stroke} strokeWidth={strokeWidth} fill="none" />
    </Svg>
  );
}

function ChevronRight({ size = 15, color: stroke, strokeWidth = 2.2 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function BackChevron({ color: stroke }: { color: string }) {
  return (
    <Svg width={9} height={15} viewBox="0 0 9 15">
      <Path d="M7 2L2 7.5 7 13" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function Check({ size = 12, color: stroke, strokeWidth = 3.6 }: { size?: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6L9 17l-5-5" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

function PencilGlyph({ size = 14, color: stroke }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// --- Reason tag -----------------------------------------------------------

const REASON_META: Record<MergeReason, { label: string; fg: string; bg: string }> = {
  same_name: { label: 'SAME NAME', fg: color.text3, bg: color.surface3 },
  // tokens.ts names the #4C8DFF "water" accent `drop`.
  same_import: { label: 'SAME IMPORT', fg: color.drop, bg: 'rgba(76,141,255,0.1)' },
  similar_name: { label: 'SIMILAR NAME', fg: color.warning, bg: 'rgba(255,194,75,0.1)' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sinceLabel(ms: number | null): string {
  if (ms === null) return 'no history yet';
  const d = new Date(ms);
  return `since ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type Step = 'loading' | 'list' | 'detail' | 'success';

export default function MergeDuplicates() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unit = useWeightUnit();
  const params = useLocalSearchParams<{ ids?: string }>();
  const manualIds = (Array.isArray(params.ids) ? params.ids[0] : params.ids)?.split(',').filter(Boolean);

  const [step, setStep] = useState<Step>('loading');
  const [groups, setGroups] = useState<MergeGroupView[]>([]);
  const [totalScanned, setTotalScanned] = useState(0);
  const [active, setActive] = useState<MergeGroupView | null>(null);
  const [survivorId, setSurvivorId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStep('loading');
    try {
      if (manualIds && manualIds.length >= 2) {
        const group = await buildManualGroup(manualIds);
        if (group) {
          setActive(group);
          setSurvivorId(group.survivorId);
          setStep('detail');
          return;
        }
      }
      const [found, total] = await Promise.all([findDuplicateGroups(), countExercises()]);
      setGroups(found);
      setTotalScanned(total);
      setStep('list');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not scan the library');
      setStep('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openGroup = (group: MergeGroupView) => {
    setActive(group);
    setSurvivorId(group.survivorId);
    setStep('detail');
  };

  const doMerge = async () => {
    if (!active || !survivorId || merging) return;
    const losers = active.members.filter((m) => m.id !== survivorId).map((m) => m.id);
    setMerging(true);
    try {
      const res = await mergeExercises(survivorId, losers);
      haptics.success(); // the causal moment — the merge landing
      setSheetOpen(false);
      setResult(res);
      // Drop the merged group; keep the rest for "N remaining".
      setGroups((prev) => prev.filter((g) => g !== active));
      setStep('success');
    } catch (e) {
      setSheetOpen(false);
      if (e instanceof ActiveSessionError) {
        Alert.alert('Can’t merge right now', e.message);
      } else {
        Alert.alert('Merge failed', e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setMerging(false);
    }
  };

  const rename = (id: string, currentName: string) => {
    const commit = (name?: string) => {
      const trimmed = (name ?? '').trim();
      if (!trimmed || trimmed === currentName) return;
      patchExercise(id, { name: trimmed })
        .then(() => setResult((r) => (r ? { ...r, survivorName: trimmed } : r)))
        .catch(() => Alert.alert('Rename failed', 'Could not rename the exercise.'));
    };
    if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
      Alert.prompt('Rename exercise', undefined, commit, 'plain-text', currentName);
    } else {
      router.push(`/exercise/${id}`);
    }
  };

  // --- Detail derivations ---
  const survivor = active?.members.find((m) => m.id === survivorId) ?? null;
  const losers = active?.members.filter((m) => m.id !== survivorId) ?? [];
  const combinedSets = active?.members.reduce((s, m) => s + m.setCount, 0) ?? 0;
  const combinedWorkouts = active?.members.reduce((s, m) => s + m.workoutCount, 0) ?? 0;
  const routinesRepoint = losers.reduce((s, m) => s + m.routineCount, 0);
  const prRows =
    survivor != null ? reconcilePrs(survivor.prs, losers.map((l) => l.prs)) : [];

  // ---------------------------------------------------------------- render

  const headerPadTop = 54 + insets.top;

  if (step === 'detail' && active && survivor) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 100 + insets.top, paddingHorizontal: 16, paddingBottom: 120 + insets.bottom }}
        >
          <Text style={styles.sectionLabel}>KEEP</Text>
          <View style={{ gap: 8 }}>
            {active.members.map((m) => {
              const sel = m.id === survivorId;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSurvivorId(m.id)}
                  style={[styles.keepRow, sel ? styles.keepRowSel : styles.keepRowUnsel]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                >
                  <View style={[styles.radio, sel ? styles.radioSel : styles.radioUnsel]}>
                    {sel ? <Check color={color.accentFg} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.keepName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={[styles.keepMeta, sel && { color: color.text2 }]}>
                      {`${m.setCount} sets · ${m.workoutCount} workouts · ${sinceLabel(m.firstWorkoutMs)}`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {survivor.isCatalog ? <Text style={styles.reasonLine}>{active.survivorReason}</Text> : null}

          <Text style={[styles.sectionLabel, { paddingTop: 22 }]}>WHAT COMBINES</Text>
          <View style={styles.combineCard}>
            <View style={styles.combineRow}>
              <Check size={15} color={color.success} strokeWidth={2.6} />
              <Text style={styles.combineText}>{`${combinedSets} sets across ${combinedWorkouts} workouts`}</Text>
            </View>
            {routinesRepoint > 0 ? (
              <View style={styles.combineRow}>
                <Check size={15} color={color.success} strokeWidth={2.6} />
                <Text style={styles.combineText}>
                  {`${routinesRepoint} ${routinesRepoint === 1 ? 'routine re-points' : 'routines re-point'} automatically`}
                </Text>
              </View>
            ) : null}

            {prRows.length > 0 ? (
              <View style={styles.prBlock}>
                <Text style={styles.prHeader}>PERSONAL RECORDS · BEST OF EACH KEPT</Text>
                <View style={{ gap: 7 }}>
                  {prRows.map((r) => (
                    <View key={r.metric} style={styles.prRow}>
                      <Text style={styles.prMetric}>{prMetricLabel(r.metric)}</Text>
                      <Text style={[styles.prValue, r.fromDup && { color: color.success }]}>
                        {recordDisplay(r.metric, r.value, r.display, unit)}
                      </Text>
                      <Text style={[styles.prTag, r.fromDup && { color: color.success }]}>
                        {r.fromDup ? 'from dup' : 'kept'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <Text style={styles.finePrint}>
            Nothing is deleted except the duplicate’s empty entry. Merging can’t be undone.
          </Text>
        </ScrollView>

        {/* Header: Cancel / title / spacer (M3) */}
        <View style={[styles.detailHeader, { paddingTop: headerPadTop }]}>
          <Pressable onPress={() => (manualIds ? router.back() : setStep('list'))} hitSlop={8}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.detailTitle}>{`Merge ${active.members.length} exercises`}</Text>
          <View style={{ width: 52 }} />
        </View>

        {/* Footer CTA */}
        <View style={[styles.footer, { paddingBottom: 34 + insets.bottom }]}>
          <PressableScale style={styles.primaryCta} onPress={() => setSheetOpen(true)}>
            <Text style={styles.primaryCtaText} numberOfLines={1}>{`Merge into ${survivor.name}`}</Text>
          </PressableScale>
        </View>

        {/* M4 confirm sheet */}
        <DraggableSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} sheetStyle={styles.sheet}>
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>
          <View style={styles.sheetBody}>
            <Text style={styles.sheetTitle}>Merge these exercises?</Text>
            <Text style={styles.sheetText}>
              {`${combinedSets} sets and ${routinesRepoint} ${routinesRepoint === 1 ? 'routine' : 'routines'} will point to `}
              <Text style={styles.sheetStrong}>{survivor.name}</Text>
              {'. Your history and personal records are kept — only the duplicate’s empty entry is removed.'}
            </Text>
            <Text style={styles.sheetWarn}>This can’t be undone.</Text>
            <View style={{ gap: 10, marginTop: 20 }}>
              <PressableScale style={styles.primaryCta} onPress={doMerge} disabled={merging}>
                {merging ? <ActivityIndicator color={color.accentFg} /> : <Text style={styles.primaryCtaText}>Merge</Text>}
              </PressableScale>
              <Pressable style={styles.cancelBtn} onPress={() => setSheetOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </DraggableSheet>
      </View>
    );
  }

  // --- M5 success + remaining, or M2 list / M6 empty ---
  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 112 + insets.top, paddingHorizontal: 16, paddingBottom: 32 + insets.bottom }}
      >
        {step === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={color.text3} />
          </View>
        ) : null}

        {step === 'success' && result ? (
          <MergedReceipt result={result} onRename={() => rename(result.survivorId, result.survivorName)} />
        ) : null}

        {step !== 'loading' && (step === 'list' || step === 'success') ? (
          groups.length > 0 ? (
            <>
              {step === 'list' ? (
                <Text style={styles.intro}>
                  These look like the same lift saved twice. Merging keeps every set and PR.
                </Text>
              ) : (
                <Text style={[styles.sectionLabel, { paddingTop: 26 }]}>
                  {`${groups.length} REMAINING`}
                </Text>
              )}
              <View style={{ gap: 10 }}>
                {groups.map((g, i) => (
                  <GroupCard key={`${g.survivorId}-${i}`} group={g} dimmed={step === 'success'} onPress={() => openGroup(g)} />
                ))}
              </View>
            </>
          ) : step === 'list' ? (
            <EmptyState total={totalScanned} />
          ) : null
        ) : null}

        {loadError ? <Text style={styles.errorLine}>{loadError}</Text> : null}
      </ScrollView>

      {/* Header (M2/M5/M6) */}
      <View style={[styles.header, { paddingTop: headerPadTop }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back" accessibilityRole="button">
          <BackChevron color={color.text2} />
        </Pressable>
        <Text style={styles.title}>Merge duplicates</Text>
      </View>
    </View>
  );
}

// --- Group card (M2) ------------------------------------------------------

function GroupCard({ group, dimmed, onPress }: { group: MergeGroupView; dimmed?: boolean; onPress: () => void }) {
  const meta = REASON_META[group.reason];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, dimmed && { opacity: 0.65 }, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.reasonTag, { backgroundColor: meta.bg }]}>
          <Text style={[styles.reasonText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <ChevronRight color={color.text3} />
      </View>
      {group.members.map((m, i) => (
        <View key={m.id} style={[styles.memberRow, i > 0 && styles.memberDivider]}>
          <View style={styles.tile}>
            <Text style={styles.tileText}>{m.initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
            <Text style={styles.memberMeta} numberOfLines={1}>{`${m.equipment} · ${m.setCount} sets`}</Text>
          </View>
        </View>
      ))}
    </Pressable>
  );
}

// --- Merged receipt (M5) --------------------------------------------------

function MergedReceipt({ result, onRename }: { result: MergeResult; onRename: () => void }) {
  const unit = useWeightUnit();
  const gained = result.gainedPr;
  return (
    <View style={styles.receipt}>
      <View style={styles.receiptTop}>
        <View style={styles.receiptDisc}>
          <Check size={16} color={color.success} strokeWidth={3.2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.receiptTitle}>Merged</Text>
          <Text style={styles.receiptSub} numberOfLines={1}>{`${result.survivorName} · ${result.totalSets} sets`}</Text>
        </View>
      </View>
      <View style={styles.receiptRows}>
        <ReceiptRow label="Sets moved" value={String(result.setsMoved)} />
        <ReceiptRow label="Routines updated" value={String(result.routinesUpdated)} />
        {gained ? (
          <ReceiptRow
            label="New PR gained"
            value={`${prMetricLabel(gained.metric)} · ${recordDisplay(gained.metric, gained.value, gained.display, unit)}`}
            success
          />
        ) : null}
      </View>
      <Pressable style={styles.renameBtn} onPress={onRename} accessibilityRole="button">
        <PencilGlyph color={color.text1} />
        <Text style={styles.renameText}>Rename exercise</Text>
      </Pressable>
    </View>
  );
}

function ReceiptRow({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptRowLabel}>{label}</Text>
      <Text style={[styles.receiptRowValue, success && { color: color.success }]}>{value}</Text>
    </View>
  );
}

// --- Empty state (M6) -----------------------------------------------------

function EmptyState({ total }: { total: number }) {
  const scope =
    total > 0
      ? `Ischys compares names, equipment and import source across all ${total} exercises.`
      : 'Ischys compares names, equipment and import source across your whole library.';
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <MergeGlyph size={28} color={color.text3} />
      </View>
      <Text style={styles.emptyTitle}>No duplicates found</Text>
      <Text style={styles.emptyBody}>{`Your library is clean. ${scope}`}</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyCardLabel}>IF YOU SPOT ONE ANYWAY</Text>
        <Text style={styles.emptyCardText}>Select both in the exercise library and choose Merge.</Text>
      </View>
    </View>
  );
}

// --- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  loading: { paddingTop: 40, alignItems: 'center' },

  // Header (M2/M5/M6)
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },

  // Detail header (M3): Cancel / title / spacer
  detailHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,11,0.94)',
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancel: { fontFamily: font.titleSemi, fontSize: 15, color: color.text2, width: 52 },
  detailTitle: { fontFamily: font.titleSemi, fontSize: 16, letterSpacing: -0.16, color: color.text1 },

  intro: { fontFamily: font.bodyRegular, fontSize: 13, lineHeight: 19.5, color: color.text2, paddingHorizontal: 2, paddingBottom: 16 },
  errorLine: { fontFamily: font.monoRegular, fontSize: 11, color: color.error, marginTop: 12 },

  sectionLabel: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    letterSpacing: 1.54,
    color: color.text3,
    paddingHorizontal: 2,
    paddingBottom: 10,
    textTransform: 'uppercase',
  },

  // --- M2 group card ---
  card: { backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, borderRadius: 16, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  reasonTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  reasonText: { fontFamily: font.monoRegular, fontSize: 9.5, letterSpacing: 1.52 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberDivider: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: color.hair },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { fontFamily: font.monoSemi, fontSize: 13, color: color.accent },
  memberName: { fontFamily: font.titleSemi, fontSize: 14.5, letterSpacing: -0.145, color: color.text1 },
  memberMeta: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3, marginTop: 2 },

  // --- M3 keep rows ---
  keepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, borderWidth: 1 },
  keepRowSel: { backgroundColor: accentA(0.07), borderColor: color.accent },
  keepRowUnsel: { backgroundColor: color.surface1, borderColor: color.border },
  radio: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  radioSel: { backgroundColor: color.accent },
  radioUnsel: { borderWidth: 1.5, borderColor: color.border },
  keepName: { fontFamily: font.titleSemi, fontSize: 14.5, letterSpacing: -0.145, color: color.text1 },
  keepMeta: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3, marginTop: 2 },
  reasonLine: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3, paddingHorizontal: 2, paddingTop: 8 },

  // --- M3 what combines ---
  combineCard: { backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 16, gap: 11 },
  combineRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  combineText: { flex: 1, fontFamily: font.bodyRegular, fontSize: 13.5, color: color.text1 },
  prBlock: { borderTopWidth: 1, borderTopColor: color.hair, paddingTop: 11 },
  prHeader: { fontFamily: font.monoRegular, fontSize: 10, letterSpacing: 1.4, color: color.text3, marginBottom: 9 },
  prRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  prMetric: { flex: 1, fontFamily: font.monoRegular, fontSize: 11.5, color: color.text3 },
  prValue: { fontFamily: font.monoSemi, fontSize: 12.5, color: color.text1, fontVariant: ['tabular-nums'] },
  prTag: { fontFamily: font.monoRegular, fontSize: 10, color: color.text3, width: 62, textAlign: 'right' },
  finePrint: { fontFamily: font.bodyRegular, fontSize: 12.5, lineHeight: 18.75, color: color.text3, paddingHorizontal: 2, paddingTop: 12 },

  // Footer CTA (M3)
  footer: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  primaryCta: {
    height: 52,
    borderRadius: 14,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: color.accent, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 14 } },
      android: { elevation: 12 },
      default: {},
    }),
  },
  primaryCtaText: { fontFamily: font.displayBold, fontSize: 15, letterSpacing: -0.15, color: color.accentFg, paddingHorizontal: 16 },

  // --- M4 sheet ---
  sheet: { backgroundColor: color.surface1, borderTopWidth: 1, borderTopColor: color.border, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 26 },
  grabberWrap: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
  sheetBody: { paddingHorizontal: 20, paddingTop: 14 },
  sheetTitle: { fontFamily: font.displayBold, fontSize: 19, letterSpacing: -0.38, color: color.text1 },
  sheetText: { fontFamily: font.bodyRegular, fontSize: 14, lineHeight: 21.7, color: color.text2, marginTop: 10 },
  sheetStrong: { fontFamily: font.titleSemi, color: color.text1 },
  sheetWarn: { fontFamily: font.monoRegular, fontSize: 11.5, color: color.warning, marginTop: 12 },
  cancelBtn: { height: 48, borderRadius: 13, backgroundColor: color.surface2, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },

  // --- M5 receipt ---
  receipt: { backgroundColor: 'rgba(45,216,129,0.07)', borderWidth: 1, borderColor: 'rgba(45,216,129,0.26)', borderRadius: 16, padding: 16 },
  receiptTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  receiptDisc: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(45,216,129,0.16)', alignItems: 'center', justifyContent: 'center' },
  receiptTitle: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },
  receiptSub: { fontFamily: font.monoRegular, fontSize: 11.5, color: color.text3, marginTop: 2 },
  receiptRows: { gap: 7, marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: 'rgba(45,216,129,0.18)' },
  receiptRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  receiptRowLabel: { flex: 1, fontFamily: font.monoRegular, fontSize: 11.5, color: color.text3 },
  receiptRowValue: { fontFamily: font.monoSemi, fontSize: 12.5, color: color.text1 },
  renameBtn: { height: 44, borderRadius: 12, backgroundColor: color.surface2, borderWidth: 1, borderColor: color.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 16 },
  renameText: { fontFamily: font.titleSemi, fontSize: 13.5, color: color.text1 },

  // --- M6 empty ---
  empty: { alignItems: 'center', paddingTop: 50, paddingHorizontal: 12 },
  emptyIcon: { width: 62, height: 62, borderRadius: 17, backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: font.displayBold, fontSize: 20, letterSpacing: -0.4, color: color.text1, marginTop: 16, textAlign: 'center' },
  emptyBody: { fontFamily: font.bodyRegular, fontSize: 13.5, lineHeight: 21, color: color.text2, marginTop: 9, textAlign: 'center' },
  emptyCard: { width: '100%', backgroundColor: color.surface1, borderWidth: 1, borderColor: color.border, borderRadius: 14, padding: 14, marginTop: 26 },
  emptyCardLabel: { fontFamily: font.monoRegular, fontSize: 10, letterSpacing: 1.4, color: color.text3 },
  emptyCardText: { fontFamily: font.bodyRegular, fontSize: 13, lineHeight: 19.5, color: color.text2, marginTop: 8 },
});
