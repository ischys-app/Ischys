/**
 * Import screen — pick a Hevy CSV export, preview parsed counts, then import it
 * into the local database. Three states drive the layout via local `step`:
 * file_pick -> preview -> progress (which auto-flips to 'success' when the import
 * resolves, or 'error' on failure).
 * Source of truth: export/ischys-app/Import.dc.html.
 */
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ImportResult } from '../src/api/types';
import { importFile } from '../src/api/workouts';
import { CheckIcon, UploadIcon } from '../src/components/icons';
import { color, font } from '../src/theme/tokens';

type Step = 'file_pick' | 'preview' | 'progress' | 'success' | 'error';

type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
};

type ParsedCsv = {
  supported: true;
  rows: Record<string, string>[];
  workouts: number;
  exercises: number;
  sets: number;
  cardioSkipped: number;
  firstWorkouts: { name: string; count: number }[];
};

type ParsePayload = ParsedCsv | { supported: false };

/** Slim chevron-left glyph matching the header back button in `settings.tsx`. */
function BackChevronLeftIcon({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={9} height={15} viewBox="0 0 9 15">
      <Path
        d="M7 2L2 7.5 7 13"
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** X close glyph — 14dp, used by the Import header left slot. */
function XGlyph({ color: strokeColor }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path
        d="M18 6L6 18M6 6l12 12"
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** Minimal CSV parser: handles quoted fields with embedded commas / quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // consume CRLF as one break
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // skip trailing blank lines
      if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const rec: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) rec[header[c]] = rows[r][c] ?? '';
    out.push(rec);
  }
  return out;
}

function summarize(rows: Record<string, string>[]): ParsedCsv {
  const workouts = new Set<string>();
  const exercises = new Set<string>();
  const workoutOrder: string[] = [];
  const workoutCounts: Record<string, { name: string; count: number }> = {};
  let cardioSkipped = 0;
  for (const r of rows) {
    const title = r['title'] ?? '';
    const start = r['start_time'] ?? '';
    const wKey = `${title}||${start}`;
    if (!workouts.has(wKey)) {
      workouts.add(wKey);
      workoutOrder.push(wKey);
      workoutCounts[wKey] = { name: title || 'Untitled', count: 0 };
    }
    workoutCounts[wKey].count += 1;
    const ex = r['exercise_title'] ?? '';
    if (ex) exercises.add(ex);
    const weight = (r['weight_kg'] ?? '').trim();
    const reps = (r['reps'] ?? '').trim();
    const weightNum = weight === '' ? NaN : Number(weight);
    const repsNum = reps === '' ? NaN : Number(reps);
    const hasWeight = Number.isFinite(weightNum) && weightNum > 0;
    const hasReps = Number.isFinite(repsNum) && repsNum > 0;
    if (!hasWeight && !hasReps) cardioSkipped += 1;
  }
  const firstWorkouts = workoutOrder.slice(0, 5).map((k) => workoutCounts[k]);
  return {
    supported: true,
    rows,
    workouts: workouts.size,
    exercises: exercises.size,
    sets: rows.length,
    cardioSkipped,
    firstWorkouts,
  };
}

export default function ImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('file_pick');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [parse, setParse] = useState<ParsePayload | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Client-side parse when a file is picked, so preview can show counts.
  useEffect(() => {
    if (!file) {
      setParse(null);
      return;
    }
    const isCsv =
      (file.mimeType ?? '').includes('csv') || /\.csv$/i.test(file.name);
    if (!isCsv) {
      setParse({ supported: false });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(file.uri);
        const text = await res.text();
        if (cancelled) return;
        const rows = parseCsv(text);
        setParse(summarize(rows));
      } catch {
        if (!cancelled) setParse({ supported: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const pick = async () => {
    setErrorMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType });
      setStep('preview');
    } catch (e) {
      setErrorMsg(String(e));
    }
  };

  const startImport = async () => {
    if (!file) return;
    setStep('progress');
    try {
      const r = await importFile(file);
      setResult(r);
      setStep('success');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStep('error');
    }
  };

  const reset = () => {
    setErrorMsg(null);
    setFile(null);
    setParse(null);
    setResult(null);
    setStep('file_pick');
  };

  const inProgress = step === 'progress';

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 108 + insets.top, paddingBottom: 40 + insets.bottom },
        ]}
      >
        {step === 'file_pick' && (
          <FilePickState onPick={pick} errorMsg={errorMsg} />
        )}
        {step === 'preview' && file && (
          <PreviewState
            file={file}
            parse={parse}
            onChangeFile={() => setStep('file_pick')}
            onImport={startImport}
          />
        )}
        {step === 'progress' && <ProgressState />}
        {step === 'success' && result && (
          <SuccessState
            result={result}
            onDone={() => (router.canGoBack() ? router.dismissAll() : router.replace('/(tabs)'))}
          />
        )}
        {step === 'error' && (
          <ErrorState message={errorMsg ?? 'Import failed'} onRetry={reset} />
        )}
      </ScrollView>

      {/* Fixed header */}
      <View
        style={[
          styles.header,
          { paddingTop: 54 + insets.top },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
            inProgress && styles.backBtnDisabled,
          ]}
          pointerEvents={inProgress ? 'none' : 'auto'}
          hitSlop={8}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <XGlyph color={color.text2} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>Import history</Text>
        <View style={styles.headerSpacer} />
      </View>
    </View>
  );
}

// --- States ---------------------------------------------------------------

function FilePickState({
  onPick,
  errorMsg,
}: {
  onPick: () => void;
  errorMsg: string | null;
}) {
  return (
    <View style={styles.pickWrap}>
      <View style={styles.dropzone}>
        <View style={styles.dropzoneIconWrap}>
          <UploadIcon size={30} color={color.accent} strokeWidth={2} />
        </View>
        <Text style={styles.dropzoneTitle}>Choose a Hevy CSV export</Text>
        <Text style={styles.dropzoneSub}>
          Point Ischys at a Hevy CSV export and we&apos;ll map every set into
          your log.
        </Text>
        <Pressable
          onPress={onPick}
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.chooseBtn,
            pressed && styles.primaryBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Browse files"
        >
          <Text style={styles.primaryBtnText}>Browse files</Text>
        </Pressable>
      </View>

      {/* WHAT GETS IMPORTED checklist */}
      <Text style={styles.checklistLabel}>WHAT GETS IMPORTED</Text>
      <View style={styles.checklistCard}>
        <ChecklistRow text="Every set with weight × reps" />
        <ChecklistRow text="Workout names, dates, and exercise groupings" />
        <ChecklistRow text="Set types (warmup / drop / failure) mapped to Ischys" />
        <ChecklistRow text="Notes on workouts and exercises" />
      </View>

      <Text style={styles.smallPrint}>
        Supported today: <Text style={styles.smallPrintStrong}>Hevy CSV</Text>.
        Cardio-only rows (distance/duration without weight × reps) are skipped.
      </Text>
      {!!errorMsg && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}
    </View>
  );
}

function ChecklistRow({ text }: { text: string }) {
  return (
    <View style={styles.checklistRow}>
      <CheckIcon size={16} color={color.accent} strokeWidth={2.6} />
      <Text style={styles.checklistText}>{text}</Text>
    </View>
  );
}

function PreviewState({
  file,
  parse,
  onChangeFile,
  onImport,
}: {
  file: PickedFile;
  parse: ParsePayload | null;
  onChangeFile: () => void;
  onImport: () => void;
}) {
  const workoutCount = parse && parse.supported ? parse.workouts : 0;
  const importLabel =
    parse && parse.supported
      ? `Import ${workoutCount} workout${workoutCount === 1 ? '' : 's'}`
      : 'Import file';

  return (
    <View style={styles.previewWrap}>
      <Text style={styles.label}>SELECTED FILE</Text>
      <View style={styles.fileRow}>
        <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
          {file.name}
        </Text>
        <Pressable
          onPress={onChangeFile}
          style={({ pressed }) => [
            styles.changeBtn,
            pressed && styles.changeBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Change file"
        >
          <Text style={styles.changeBtnText}>Change file</Text>
        </Pressable>
      </View>

      {parse === null && (
        <Text style={styles.parseHint}>Reading file…</Text>
      )}

      {parse && !parse.supported && (
        <Text style={styles.parseHint}>
          This doesn&apos;t look like a Hevy CSV. Export your workouts as CSV and try again.
        </Text>
      )}

      {parse && parse.supported && (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.statsRow}>
              <StatCell label="WORKOUTS" value={parse.workouts} />
              <StatCell label="EXERCISES" value={parse.exercises} />
              <StatCell label="SETS" value={parse.sets} />
            </View>
            {parse.cardioSkipped > 0 && (
              <Text style={styles.cardioSkip}>
                {parse.cardioSkipped} rows will be skipped (cardio / rest-only)
              </Text>
            )}
          </View>

          {parse.firstWorkouts.length > 0 && (
            <>
              <Text style={[styles.label, styles.firstLabel]}>FIRST WORKOUTS</Text>
              <View style={styles.previewList}>
                {parse.firstWorkouts.map((w, i) => (
                  <View key={`${w.name}-${i}`} style={styles.previewRow}>
                    <Text
                      style={styles.previewName}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {w.name}
                    </Text>
                    <Text style={styles.previewCount}>
                      {w.count} set{w.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      <Pressable
        onPress={onImport}
        disabled={!parse || !parse.supported}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.importBtn,
          pressed && styles.primaryBtnPressed,
          (!parse || !parse.supported) && styles.importBtnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !parse || !parse.supported }}
        accessibilityLabel={importLabel}
      >
        <Text style={styles.importBtnText}>{importLabel}</Text>
      </Pressable>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** 118dp progress ring with a rotating arc + faked percentage counter. */
function ProgressState() {
  const spin = useRef(new Animated.Value(0)).current;
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  useEffect(() => {
    // Fake progress: tick 0 → 95% over 2.5s.
    const startedAt = Date.now();
    const totalMs = 2500;
    const id = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const next = Math.min(95, Math.round((elapsed / totalMs) * 95));
      setPct(next);
      if (elapsed >= totalMs) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, []);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.progressWrap}>
      <View style={styles.ring}>
        <Svg width={118} height={118} viewBox="0 0 120 120">
          <Circle
            cx={60}
            cy={60}
            r={54}
            stroke="rgba(255,74,28,0.15)"
            strokeWidth={4}
            fill="none"
          />
        </Svg>
        <Animated.View style={[styles.ringArc, { transform: [{ rotate }] }]}>
          <Svg width={118} height={118} viewBox="0 0 120 120">
            <Circle
              cx={60}
              cy={60}
              r={54}
              stroke={color.accent}
              strokeWidth={4}
              strokeDasharray="60 400"
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={styles.ringPct}>{pct}%</Text>
        </View>
      </View>
      <Text style={styles.progressCaption}>Importing…</Text>
    </View>
  );
}

function SuccessState({
  result,
  onDone,
}: {
  result: ImportResult;
  onDone: () => void;
}) {
  return (
    <View style={styles.successWrap}>
      <View style={styles.successBadge}>
        <CheckIcon size={30} color={color.accentFg} strokeWidth={3} />
      </View>
      <Text style={styles.successTitle}>History imported</Text>
      <Text style={styles.successStats}>
        {result.workouts_created} workouts · {result.exercises_created} exercises
        · {result.sets_imported} sets
      </Text>
      {result.rows_skipped > 0 && (
        <Text style={styles.successSkipped}>
          {result.rows_skipped} rows skipped
        </Text>
      )}
      {result.warnings.map((w) => (
        <Text key={w} style={styles.successSkipped}>
          {w}
        </Text>
      ))}
      <Pressable
        onPress={onDone}
        style={({ pressed }) => [
          styles.primaryBtn,
          styles.doneBtn,
          pressed && styles.primaryBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Done"
      >
        <Text style={styles.importBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.pickWrap}>
      <View style={styles.errorBanner}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.retryBtn,
          pressed && styles.retryBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.retryBtnText}>Try again</Text>
      </Pressable>
    </View>
  );
}

// --- Styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },

  // Header
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
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { opacity: 0.7 },
  backBtnDisabled: { opacity: 0.5 },
  headerSpacer: {
    width: 30,
    height: 30,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.titleSemi,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.17,
    color: color.text1,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 16,
    flexGrow: 1,
  },

  // --- File pick state ---
  pickWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dropzone: {
    alignSelf: 'stretch',
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.border,
    paddingTop: 28,
    paddingBottom: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: color.surface1,
    marginTop: 8,
  },
  dropzoneIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 15,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  dropzoneTitle: {
    fontFamily: font.displayBold,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.36,
    color: color.text1,
    textAlign: 'center',
  },
  dropzoneSub: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    color: color.text2,
    lineHeight: 21,
    maxWidth: 280,
    marginTop: 8,
    textAlign: 'center',
  },
  chooseBtn: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 22,
  },
  checklistLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.0,
    color: color.text3,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
    alignSelf: 'flex-start',
    paddingLeft: 2,
  },
  checklistCard: {
    alignSelf: 'stretch',
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checklistText: {
    flex: 1,
    fontFamily: font.bodyRegular,
    fontSize: 13.5,
    color: color.text2,
    lineHeight: 20,
  },
  smallPrint: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    marginTop: 22,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  smallPrintStrong: {
    color: color.text2,
    fontFamily: font.monoSemi,
    fontWeight: '600',
  },

  // Primary button (shared shell)
  primaryBtn: {
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: {
    fontFamily: font.displayBold,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
    color: color.accentFg,
  },

  // --- Preview state ---
  previewWrap: { flexDirection: 'column' },
  label: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.0,
    color: color.text3,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 2,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fileName: {
    flex: 1,
    fontFamily: font.monoRegular,
    fontSize: 14,
    color: color.text1,
  },
  changeBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBtnPressed: { borderColor: color.text3 },
  changeBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 12.5,
    fontWeight: '600',
    color: color.text2,
  },
  parseHint: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    marginTop: 18,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 22,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  statLabel: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1.0,
    color: color.text3,
    textTransform: 'uppercase',
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.44,
    color: color.text1,
    fontVariant: ['tabular-nums'],
  },
  cardioSkip: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
  },
  firstLabel: { marginTop: 16 },
  previewList: { flexDirection: 'column', gap: 8 },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewName: {
    flex: 1,
    fontFamily: font.bodyMedium,
    fontSize: 14,
    fontWeight: '500',
    color: color.text1,
    paddingRight: 10,
  },
  previewCount: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    fontVariant: ['tabular-nums'],
  },
  importBtn: {
    height: 54,
    borderRadius: 13,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  importBtnDisabled: {
    opacity: 0.4,
  },
  importBtnText: {
    fontFamily: font.displayBold,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.16,
    color: color.accentFg,
  },

  // --- Progress state ---
  progressWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
  },
  ring: {
    width: 118,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 118,
    height: 118,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: {
    fontFamily: font.monoBold,
    fontSize: 26,
    fontWeight: '700',
    color: color.accent,
    fontVariant: ['tabular-nums'],
  },
  progressCaption: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 16,
    textAlign: 'center',
  },

  // --- Success state ---
  successWrap: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
  },
  successBadge: {
    width: 60,
    height: 60,
    borderRadius: 17,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: color.accent,
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 10 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  successTitle: {
    fontFamily: font.displayBold,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.48,
    color: color.text1,
    marginTop: 16,
    textAlign: 'center',
  },
  successStats: {
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.text2,
    marginTop: 8,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  successSkipped: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text3,
    marginTop: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  doneBtn: {
    height: 54,
    borderRadius: 13,
    marginTop: 28,
    alignSelf: 'stretch',
  },

  // --- Error banner + retry ---
  errorBanner: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,77,77,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.28)',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 22,
  },
  errorText: {
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.error,
  },
  retryBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    alignSelf: 'center',
  },
  retryBtnPressed: { borderColor: color.text3 },
  retryBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    fontWeight: '600',
    color: color.text1,
  },
});
