/**
 * Import screen — pick a workout CSV export, preview parsed counts, then import it
 * into the local database. Three states drive the layout via local `step`:
 * file_pick -> preview -> progress (which auto-flips to 'success' when the import
 * resolves, or 'error' on failure).
 * Source of truth: export/ischys-app/Import.dc.html.
 */
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ImportResult } from '../src/api/types';
import { getSettings, importFile, saveAsRoutine } from '../src/api/workouts';
import { summarizeWorkoutCsv } from '../src/data/workoutCsv';
import type { Unit } from '../src/domain/units';
import {
  createRoutinesLabel,
  groupImportedRoutines,
  isRecentlyTrained,
  lastTrainedLabel,
  partialFailureNote,
  routineCandidateMeta,
  seenOnceLabel,
  splitSeenOnce,
  titlesHeaderLabel,
  type RoutineCandidate,
} from '../src/domain/importedRoutines';
import { CheckIcon, ChevronDownIcon, UploadIcon } from '../src/components/icons';
import { PressableScale } from '../src/components/PressableScale';
import { Segment, SelectCircle, type SegmentOption } from '../src/components/ui';
import { haptics } from '../src/lib/haptics';
import { accentA, color, font, themed, withAlpha } from '../src/theme/tokens';
import { useThemed } from '../src/theme/ThemeProvider';

type Step = 'file_pick' | 'preview' | 'progress' | 'success' | 'error';

/** Same options, same control, as the Units row in Settings. */
const UNIT_OPTIONS: SegmentOption<Unit>[] = [
  { label: 'KG', value: 'kg' },
  { label: 'LB', value: 'lb' },
];

type PickedFile = {
  uri: string;
  name: string;
  mimeType?: string;
};

type ParsedPreview = {
  supported: true;
  /** A CSV preview can be re-read under a different weight unit; a JSON backup is already canonical. */
  kind: 'csv' | 'json';
  workouts: number;
  exercises: number;
  sets: number;
  cardioSkipped?: number;
  rowsSkipped?: number;
  /** False only for a CSV whose weight column never named its unit — then the user picks. */
  weightUnitKnown: boolean;
  firstWorkouts: { name: string; count: number }[];
};

type ParsePayload = ParsedPreview | { supported: false };

/** Preview summary for an Ischys JSON backup. */
function summarizeJson(text: string): ParsePayload {
  try {
    const data = JSON.parse(text);
    const wk = Array.isArray(data?.workouts) ? data.workouts : null;
    if (!wk) return { supported: false };
    const exercises = new Set<string>();
    let sets = 0;
    const firstWorkouts: { name: string; count: number }[] = [];
    for (let i = 0; i < wk.length; i++) {
      const w = wk[i] ?? {};
      let count = 0;
      for (const ex of Array.isArray(w.exercises) ? w.exercises : []) {
        if (ex?.name) exercises.add(ex.name);
        count += Array.isArray(ex?.sets) ? ex.sets.length : 0;
      }
      sets += count;
      if (i < 5) firstWorkouts.push({ name: (w.name ?? 'Workout') || 'Workout', count });
    }
    return { supported: true, kind: 'json', weightUnitKnown: true, workouts: wk.length, exercises: exercises.size, sets, firstWorkouts };
  } catch {
    return { supported: false };
  }
}

/** Slim chevron-left glyph matching the header back button in `settings.tsx`. */
function BackChevronLeftIcon({ color: strokeColor }: { color: string }) {
  useThemed();
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
  useThemed();
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

/**
 * Preview counts for a workout CSV. Deliberately delegates to the same
 * summarizeWorkoutCsv/parseWorkoutCsv the import itself runs: this screen used to
 * carry its own parser that recognised only one set of column names, so a CSV with
 * different headers previewed as a single untitled workout and then imported nothing.
 */
function summarizeCsvPreview(text: string, weightUnit: Unit): ParsePayload {
  const s = summarizeWorkoutCsv(text, { weightUnit });
  if (s.unmapped || s.workouts === 0) return { supported: false };
  return {
    supported: true,
    kind: 'csv',
    workouts: s.workouts,
    exercises: s.exercises,
    sets: s.sets,
    cardioSkipped: s.cardioSkipped,
    rowsSkipped: s.rowsSkipped,
    weightUnitKnown: s.weightUnitKnown,
    firstWorkouts: s.firstWorkouts,
  };
}

// --- Routines from imported history (board 12a) ---------------------------

/**
 * The pick list state. An import restores sessions, not routines, so the success
 * screen offers to rebuild them — one `saveAsRoutine` per picked title, from that
 * title's most recent session.
 *
 * Nothing starts ticked: session count can't tell a routine from a scratch name,
 * and a suggestion the user has to un-tick is auto-creation with extra steps.
 */
function useRoutinePicks(result: ImportResult | null, onCreated: () => void) {
  const candidates = useMemo(
    () => groupImportedRoutines(result?.imported_sessions ?? []),
    [result],
  );
  const { rows, seenOnce } = useMemo(() => splitSeenOnce(candidates), [candidates]);
  const newestAt = candidates.length ? candidates[0].lastTrainedAt : 0;

  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failedKeys, setFailedKeys] = useState<string[]>([]);
  // Keys already written. A retry must not create a second copy of a routine
  // that landed on the first attempt.
  const createdKeys = useRef(new Set<string>());

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Changing the picks invalidates the last attempt's tally, so the footer goes
    // back to Create rather than reporting a count that no longer adds up.
    setFailedKeys([]);
  };

  const failedNames = candidates.filter((c) => failedKeys.includes(c.key)).map((c) => c.name);
  const failureNote = partialFailureNote(createdKeys.current.size, picked.size, failedNames);

  const create = async () => {
    if (busy) return;
    const targets = candidates.filter(
      (c) => picked.has(c.key) && !createdKeys.current.has(c.key),
    );
    if (targets.length === 0) {
      onCreated();
      return;
    }
    setBusy(true);
    const failures: string[] = [];
    // Sequential: each routine's position is derived from the rows already there,
    // and so is the "(2)" suffix a name clash gets.
    for (const c of targets) {
      try {
        await saveAsRoutine(c.workoutId);
        createdKeys.current.add(c.key);
      } catch {
        failures.push(c.key);
      }
    }
    setFailedKeys(failures);
    setBusy(false);
    if (failures.length === 0) {
      haptics.success();
      onCreated();
    } else {
      // Nothing is rolled back — the routines that landed are still what was asked for.
      haptics.error();
    }
  };

  return {
    candidates,
    rows: expanded ? candidates : rows,
    seenOnce,
    expanded,
    expand: () => setExpanded(true),
    picked,
    toggle,
    newestAt,
    busy,
    failureNote,
    retrying: failedKeys.length > 0,
    create,
  };
}

type RoutinePicks = ReturnType<typeof useRoutinePicks>;

/** The vertical fade that lifts the pinned CTA off the scrolling list. */
function FooterFade() {
  useThemed();
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id="importFooterFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.bg} stopOpacity={0} />
          <Stop offset="0.38" stopColor={color.bg} stopOpacity={1} />
          <Stop offset="1" stopColor={color.bg} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#importFooterFade)" />
    </Svg>
  );
}

function RoutineCandidateRow({
  candidate,
  selected,
  recent,
  dateLabel,
  onToggle,
}: {
  candidate: RoutineCandidate;
  selected: boolean;
  recent: boolean;
  dateLabel: string;
  onToggle: () => void;
}) {
  useThemed();
  return (
    // The whole row is the tap target — a 24pt circle alone is not a thumb target,
    // and people tap the name expecting it to tick.
    <Pressable
      onPress={onToggle}
      style={[
        styles.candidateRow,
        { backgroundColor: selected ? accentA(0.07) : 'transparent' },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={candidate.name}
      accessibilityHint="Saves this as a routine"
    >
      <SelectCircle selected={selected} />
      <View style={styles.candidateText}>
        <Text style={styles.candidateName} numberOfLines={1} ellipsizeMode="tail">
          {candidate.name}
        </Text>
        <Text style={styles.candidateMeta} numberOfLines={1}>
          {routineCandidateMeta(candidate)}
        </Text>
      </View>
      <Text style={[styles.candidateDate, { color: recent ? color.text2 : color.text3 }]}>
        {dateLabel}
      </Text>
    </Pressable>
  );
}

function RoutinesCard({ picks }: { picks: RoutinePicks }) {
  useThemed();
  const { candidates, rows, seenOnce, expanded, picked, newestAt } = picks;
  return (
    <View style={styles.routinesCard}>
      <Text style={styles.routinesLabel}>ROUTINES</Text>
      <Text style={styles.routinesHeading}>Save any as routines?</Text>
      <Text style={styles.routinesBody}>
        Your import restored sessions, not routines. Pick the ones you still train. Each is
        built from its most recent session.
      </Text>

      <View style={styles.routinesListHead}>
        <Text style={[styles.routinesListHeadText, styles.routinesListHeadLeft]}>
          {titlesHeaderLabel(candidates.length)}
        </Text>
        <Text style={styles.routinesListHeadText}>LAST TRAINED</Text>
      </View>

      <View style={styles.routinesList}>
        {rows.map((c) => (
          <RoutineCandidateRow
            key={c.key}
            candidate={c}
            selected={picked.has(c.key)}
            recent={isRecentlyTrained(c.lastTrainedAt, newestAt)}
            dateLabel={lastTrainedLabel(c.lastTrainedAt, newestAt)}
            onToggle={() => picks.toggle(c.key)}
          />
        ))}
        {!expanded && seenOnce.length > 0 && (
          <Pressable
            onPress={picks.expand}
            style={styles.seenOnceRow}
            accessibilityRole="button"
            accessibilityLabel={seenOnceLabel(seenOnce.length)}
            accessibilityHint="Shows the titles trained once"
          >
            <View style={styles.seenOnceChevron}>
              <ChevronDownIcon size={14} color={color.text3} />
            </View>
            <Text style={styles.seenOnceText}>{seenOnceLabel(seenOnce.length)}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/**
 * The pinned bottom bar of the success screen. One accent button, which reads
 * "Done" until something is picked — so leaving without creating is one tap
 * whichever way the user came at it.
 */
function SuccessFooter({
  picks,
  offerRoutines,
  onDone,
  onLayoutHeight,
  bottomInset,
}: {
  picks: RoutinePicks;
  offerRoutines: boolean;
  onDone: () => void;
  onLayoutHeight: (h: number) => void;
  bottomInset: number;
}) {
  useThemed();
  const count = offerRoutines ? picks.picked.size : 0;
  const label = picks.retrying ? 'Retry' : createRoutinesLabel(count);
  // 34dp is the design's home-indicator allowance; a deeper inset wins.
  const paddingBottom = Math.max(34, bottomInset);
  return (
    <View
      style={[styles.successFooter, { paddingBottom }]}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
    >
      <FooterFade />
      <PressableScale
        onPress={count === 0 ? onDone : picks.create}
        disabled={picks.busy}
        style={[styles.routinesCta, picks.busy && styles.importBtnDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: picks.busy }}
        accessibilityLabel={label}
      >
        <Text style={styles.routinesCtaText}>{label}</Text>
      </PressableScale>
      {!!picks.failureNote && <Text style={styles.failureNote}>{picks.failureNote}</Text>}
      {count > 0 && (
        <Pressable
          onPress={onDone}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel={picks.retrying ? 'Done' : 'Skip'}
        >
          <Text style={styles.skipBtnText}>{picks.retrying ? 'Done' : 'Skip'}</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function ImportScreen() {
  useThemed();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('file_pick');
  const [file, setFile] = useState<PickedFile | null>(null);
  // Raw file contents, kept so the preview can be recomputed when the unit changes.
  const [source, setSource] = useState<{ kind: 'csv' | 'json'; text: string } | 'unreadable' | null>(null);
  // Only consulted for a CSV that never stated its unit. Seeded from the user's
  // own setting, which is the best guess available, but always overridable below.
  const [csvUnit, setCsvUnit] = useState<Unit>('kg');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Measured rather than assumed: the bar grows a Skip button and a failure note.
  const [footerHeight, setFooterHeight] = useState(0);

  const dismiss = () => {
    if (router.canGoBack()) router.dismissAll();
    else router.replace('/(tabs)');
  };
  // Freshly created routines are listed under History's Save-as-routine path, so
  // that is where creating lands.
  const goToHistory = () => {
    try {
      if (router.canGoBack()) router.dismissAll();
    } catch {
      // Not a dismissable stack — navigating is enough.
    }
    router.navigate('/(tabs)/history');
  };
  const picks = useRoutinePicks(result, goToHistory);
  // The card is hidden when the import named nothing — there is no title to offer.
  const offerRoutines = step === 'success' && picks.candidates.length > 0;

  // Default the unit answer to whatever the user already trains in.
  useEffect(() => {
    let alive = true;
    void getSettings()
      .then((settings) => {
        if (alive && (settings?.unit === 'kg' || settings?.unit === 'lb')) setCsvUnit(settings.unit);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Read the file when it's picked; the counts themselves are derived below so
  // changing the unit doesn't re-read from disk.
  useEffect(() => {
    setSource(null);
    if (!file) return;
    const isJson = (file.mimeType ?? '').includes('json') || /\.json$/i.test(file.name);
    const isCsv = (file.mimeType ?? '').includes('csv') || /\.csv$/i.test(file.name);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(file.uri);
        const text = await res.text();
        if (cancelled) return;
        // Sniff by extension/mime, falling back to content (JSON starts with `{`).
        const kind = isJson || (!isCsv && text.trimStart().startsWith('{')) ? 'json' : 'csv';
        setSource({ kind, text });
      } catch {
        if (!cancelled) setSource('unreadable');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  const parse = useMemo<ParsePayload | null>(() => {
    if (!file || source === null) return null; // still reading
    if (source === 'unreadable') return { supported: false };
    return source.kind === 'json'
      ? summarizeJson(source.text)
      : summarizeCsvPreview(source.text, csvUnit);
  }, [file, source, csvUnit]);

  const pick = async () => {
    setErrorMsg(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/json', '*/*'],
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
      const r = await importFile(file, { weightUnit: csvUnit });
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
    setSource(null);
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
          {
            paddingTop: 108 + insets.top,
            paddingBottom:
              step === 'success' ? footerHeight + 8 : 40 + insets.bottom,
          },
        ]}
      >
        {step === 'file_pick' && (
          <FilePickState onPick={pick} errorMsg={errorMsg} />
        )}
        {step === 'preview' && file && (
          <PreviewState
            file={file}
            parse={parse}
            weightUnit={csvUnit}
            onChangeWeightUnit={setCsvUnit}
            onChangeFile={() => setStep('file_pick')}
            onImport={startImport}
          />
        )}
        {step === 'progress' && <ProgressState />}
        {step === 'success' && result && (
          <SuccessState result={result} picks={offerRoutines ? picks : null} />
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

      {/* The success CTA is pinned, because the routines list can be long enough
          to scroll the action off the screen. */}
      {step === 'success' && (
        <SuccessFooter
          picks={picks}
          offerRoutines={offerRoutines}
          onDone={dismiss}
          onLayoutHeight={setFooterHeight}
          bottomInset={insets.bottom}
        />
      )}
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
  useThemed();
  return (
    <View style={styles.pickWrap}>
      <View style={styles.dropzone}>
        <View style={styles.dropzoneIconWrap}>
          <UploadIcon size={30} color={color.accent} strokeWidth={2} />
        </View>
        <Text style={styles.dropzoneTitle}>Choose an export to import</Text>
        <Text style={styles.dropzoneSub}>
          Point Ischys at an Ischys JSON backup or a workout CSV export and
          we&apos;ll load every set into your log.
        </Text>
        <PressableScale
          onPress={onPick}
          style={[styles.primaryBtn, styles.chooseBtn]}
          accessibilityRole="button"
          accessibilityLabel="Browse files"
        >
          <Text style={styles.primaryBtnText}>Browse files</Text>
        </PressableScale>
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
        Supported: <Text style={styles.smallPrintStrong}>Ischys JSON</Text> (a
        full backup) and a <Text style={styles.smallPrintStrong}>workout CSV</Text>.
        Cardio-only CSV rows (distance/duration without weight × reps) are skipped.
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
  useThemed();
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
  weightUnit,
  onChangeWeightUnit,
  onChangeFile,
  onImport,
}: {
  file: PickedFile;
  parse: ParsePayload | null;
  weightUnit: Unit;
  onChangeWeightUnit: (u: Unit) => void;
  onChangeFile: () => void;
  onImport: () => void;
}) {
  useThemed();
  const workoutCount = parse && parse.supported ? parse.workouts : 0;
  // When the file doesn't name its unit, name it on the button itself. The unit is
  // the one irreversible choice in this flow — a re-import is refused as a
  // duplicate — so the assumption belongs on the control being tapped, not only in
  // a note above it that is easy to scroll past.
  const unitSuffix =
    parse && parse.supported && parse.kind === 'csv' && !parse.weightUnitKnown
      ? ` as ${weightUnit.toUpperCase()}`
      : '';
  const importLabel =
    parse && parse.supported
      ? `Import ${workoutCount} workout${workoutCount === 1 ? '' : 's'}${unitSuffix}`
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
          This doesn&apos;t look like an Ischys JSON backup or a workout CSV. Pick one of those and try again.
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
            {(parse.cardioSkipped ?? 0) > 0 && (
              <Text style={styles.cardioSkip}>
                {parse.cardioSkipped} rows will be skipped (cardio / rest-only)
              </Text>
            )}
            {(parse.rowsSkipped ?? 0) > 0 && (
              <Text style={styles.cardioSkip}>
                {parse.rowsSkipped} rows will be skipped (no exercise name)
              </Text>
            )}
            {parse.kind === 'csv' && !parse.weightUnitKnown && (
              <>
                <View style={styles.unitRow}>
                  <Text style={styles.label}>WEIGHT UNIT</Text>
                  <Segment
                    options={UNIT_OPTIONS}
                    value={weightUnit}
                    onChange={onChangeWeightUnit}
                  />
                </View>
                <Text style={styles.cardioSkip}>
                  This file doesn&apos;t say, so weights are read as {weightUnit.toUpperCase()}
                </Text>
              </>
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

      <PressableScale
        onPress={onImport}
        disabled={!parse || !parse.supported}
        style={[
          styles.primaryBtn,
          styles.importBtn,
          (!parse || !parse.supported) && styles.importBtnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled: !parse || !parse.supported }}
        accessibilityLabel={importLabel}
      >
        <Text style={styles.importBtnText}>{importLabel}</Text>
      </PressableScale>
    </View>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  useThemed();
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/** 118dp progress ring with a rotating arc + faked percentage counter. */
function ProgressState() {
  useThemed();
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
            stroke={accentA(0.15)}
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

/**
 * The success screen. Counts first, then — when the import named any workouts —
 * the offer to rebuild routines from them. The action lives in the pinned footer,
 * so this is scrolling content only.
 */
function SuccessState({
  result,
  picks,
}: {
  result: ImportResult;
  picks: RoutinePicks | null;
}) {
  useThemed();
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
      {picks && (
        <>
          <RoutinesCard picks={picks} />
          <Text style={styles.routinesFootnote}>You can save more later from History.</Text>
        </>
      )}
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
  useThemed();
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

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg },

    // Header
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      backgroundColor: color.headerBg,
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
    unitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
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
    // --- Routines from imported history (board 12a) ---
    routinesCard: {
      alignSelf: 'stretch',
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 16,
      padding: 16,
      marginTop: 28,
    },
    routinesLabel: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 1.54, // 0.14em
      color: color.text3,
    },
    routinesHeading: {
      fontFamily: font.titleSemi,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: -0.4,
      color: color.text1,
      marginTop: 8,
    },
    routinesBody: {
      fontFamily: font.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      color: color.text2,
      marginTop: 6,
    },
    routinesListHead: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 28,
      marginTop: 14,
      paddingHorizontal: 4,
    },
    routinesListHeadText: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 1.1, // 0.1em
      color: color.text3,
    },
    routinesListHeadLeft: { flex: 1 },
    // The list bleeds 8dp past the card padding so a selected row's tint reads as a
    // row rather than as a box inside a box.
    routinesList: { marginHorizontal: -8, gap: 2 },
    candidateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 56,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    candidateText: { flex: 1, minWidth: 0 },
    candidateName: {
      fontFamily: font.titleSemi,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.15,
      color: color.text1,
    },
    candidateMeta: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 0.66, // 0.06em
      color: color.text3,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },
    candidateDate: {
      fontFamily: font.monoRegular,
      fontSize: 11.5,
      fontVariant: ['tabular-nums'],
    },
    seenOnceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 12,
    },
    seenOnceChevron: { width: 24, alignItems: 'center' },
    seenOnceText: {
      fontFamily: font.monoRegular,
      fontSize: 11.5,
      letterSpacing: 0.92, // 0.08em
      color: color.text2,
    },
    routinesFootnote: {
      fontFamily: font.bodyRegular,
      fontSize: 13,
      color: color.text3,
      textAlign: 'center',
      marginTop: 14,
    },

    // --- Pinned success footer ---
    successFooter: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: 36,
      paddingHorizontal: 16,
    },
    routinesCta: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    routinesCtaText: {
      fontFamily: font.displayBold,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.15,
      color: color.accentFg,
    },
    skipBtn: {
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    skipBtnText: {
      fontFamily: font.bodyMedium,
      fontSize: 14,
      fontWeight: '500',
      color: color.text2,
    },
    failureNote: {
      fontFamily: font.monoRegular,
      fontSize: 11.5,
      color: color.warning,
      textAlign: 'center',
      marginTop: 8,
    },

    // --- Error banner + retry ---
    errorBanner: {
      alignSelf: 'stretch',
      backgroundColor: withAlpha(color.error, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(color.error, 0.28),
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
  }),
);
