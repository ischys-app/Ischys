/**
 * Share Workout bottom sheet — renders a square preview card of a finished
 * workout that the user can Save to Photos or share via the system share sheet.
 *
 * Source of truth: `export/ischys-app/Share Workout.dc.html`.
 *
 * The preview is wrapped in a `<ViewShot>` so we can call `.capture()` on the
 * ref to get a PNG file URI, then hand it to expo-media-library (save) or
 * expo-sharing (share).
 */
import { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import type { WorkoutSummaryOut } from '../api/types';
import { fmtDuration } from '../lib/format';
import { parseServerDate } from '../lib/serverTime';
import { color, font } from '../theme/tokens';
import { StarIcon } from './icons';
import { Wordmark } from './Wordmark';

type Layout = 'compact' | 'standard' | 'detailed';

type Props = {
  visible: boolean;
  summary: WorkoutSummaryOut | null;
  onClose: () => void;
};

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

const MONTH_UPPER = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** e.g. "7 JUL 2026" — the compact date used inside the preview card. */
function fmtCardDate(iso: string): string {
  const d = new Date(parseServerDate(iso));
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTH_UPPER[d.getMonth()]} ${d.getFullYear()}`;
}

/** thousands-separated integer (no unit) — manual grouping (Hermes Intl gap). */
function fmtVolumeNoUnit(kg: number): string {
  return String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Best-set string for the detailed layout row (mirrors summary screen logic). */
function bestLine(sets: WorkoutSummaryOut['workout']['exercises'][number]['sets']): string {
  const working = sets.filter((s) => s.done && s.type !== 'warmup');
  if (working.length === 0) return '—';
  let best = working[0];
  for (const s of working) {
    const bw = s.weight ?? -Infinity;
    const bb = best.weight ?? -Infinity;
    if (bw > bb) best = s;
  }
  const w = best.weight == null ? 'BW' : `${best.weight}`;
  return `${w} × ${best.reps ?? 0}`;
}

function DownloadIcon({ size = 16, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3v13M8 12l4 4 4-4M4 19v2h16v-2"
        stroke={tint}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function ShareIcon({ size = 16, tint }: { size?: number; tint: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"
        stroke={tint}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const LAYOUTS: { key: Layout; label: string }[] = [
  { key: 'compact', label: 'Compact' },
  { key: 'standard', label: 'Standard' },
  { key: 'detailed', label: 'Detailed' },
];

export function ShareWorkoutSheet({ visible, summary, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [layout, setLayout] = useState<Layout>('standard');
  const [busy, setBusy] = useState(false);
  const viewShotRef = useRef<ViewShotRef>(null);

  const disabled = summary == null;

  const capture = async (): Promise<string | null> => {
    const node = viewShotRef.current;
    if (!node || typeof node.capture !== 'function') return null;
    try {
      return await node.capture();
    } catch {
      return null;
    }
  };

  const onSaveImage = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const perm = await MediaLibrary.getPermissionsAsync();
      let granted = perm.granted;
      if (!granted && perm.canAskAgain) {
        const req = await MediaLibrary.requestPermissionsAsync();
        granted = req.granted;
      }
      if (!granted) {
        Alert.alert('Permission needed', 'Ischys needs permission to save to Photos.');
        return;
      }
      const uri = await capture();
      if (!uri) {
        Alert.alert('Could not capture image', 'Please try again.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved to Photos');
    } catch {
      Alert.alert('Save failed', 'Could not save to Photos.');
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert('Sharing unavailable', 'System sharing is not available on this device.');
        return;
      }
      const uri = await capture();
      if (!uri) {
        Alert.alert('Could not capture image', 'Please try again.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share workout',
        UTI: 'public.png',
      });
    } catch {
      // user cancel is not surfaced as an error we care about
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
          onPress={() => {}}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Share workout</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close share sheet"
              style={styles.closeBtn}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24">
                <Path
                  d="M18 6L6 18M6 6l12 12"
                  stroke={color.text2}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </Svg>
            </Pressable>
          </View>

          <View style={styles.body}>
            {summary ? (
              <>
                <ViewShot
                  ref={viewShotRef}
                  options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                  style={styles.previewShot}
                >
                  <PreviewCard layout={layout} summary={summary} />
                </ViewShot>

                <View style={styles.chipsRow}>
                  {LAYOUTS.map((l) => {
                    const active = l.key === layout;
                    return (
                      <Pressable
                        key={l.key}
                        onPress={() => setLayout(l.key)}
                        style={[styles.chip, active && styles.chipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {l.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    onPress={onSaveImage}
                    disabled={busy}
                    style={[styles.saveBtn, busy && styles.actionDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Save workout image to Photos"
                  >
                    <DownloadIcon tint={color.text1} />
                    <Text style={styles.saveBtnText}>Save image</Text>
                  </Pressable>
                  <Pressable
                    onPress={onShare}
                    disabled={busy}
                    style={[styles.shareBtn, busy && styles.actionDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel="Share workout image"
                  >
                    <ShareIcon tint={color.accentFg} />
                    <Text style={styles.shareBtnText}>Share</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.previewShot, styles.emptyPreview]}>
                  <Text style={styles.emptyText}>Nothing to share</Text>
                  <Text style={styles.emptySub}>This workout has no data yet.</Text>
                </View>
                <View style={styles.actionsRow}>
                  <View style={[styles.saveBtn, styles.actionDisabled]}>
                    <DownloadIcon tint={color.text3} />
                    <Text style={[styles.saveBtnText, styles.disabledText]}>Save image</Text>
                  </View>
                  <View style={[styles.shareBtn, styles.actionDisabled]}>
                    <ShareIcon tint={color.text3} />
                    <Text style={[styles.shareBtnText, styles.disabledText]}>Share</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Preview card
// ---------------------------------------------------------------------------

function PreviewCard({ layout, summary }: { layout: Layout; summary: WorkoutSummaryOut }) {
  const { workout, prs } = summary;
  const dateStr = fmtCardDate(workout.started_at);
  const duration = fmtDuration(workout.duration_seconds);
  const volume = fmtVolumeNoUnit(workout.total_volume);
  const sets = String(workout.total_sets);

  const nameSize = layout === 'compact' ? 34 : layout === 'detailed' ? 22 : 26;
  const padding = layout === 'detailed' ? 18 : 22;

  return (
    <View style={[cardStyles.card, { padding }]}>
      {/* subtle radial-ish top-right glow — a translucent orange square via border */}
      <View pointerEvents="none" style={cardStyles.glow} />

      <View style={cardStyles.topRow}>
        <Wordmark />
        <Text style={cardStyles.date}>{dateStr}</Text>
      </View>

      <View style={cardStyles.middle}>
        <Text style={[cardStyles.name, { fontSize: nameSize }]} numberOfLines={2}>
          {workout.name}
        </Text>

        {layout === 'compact' ? (
          <View style={cardStyles.compactStat}>
            <Text style={cardStyles.compactStatLabel}>VOLUME</Text>
            <Text style={cardStyles.compactStatValue}>
              {volume}
              <Text style={cardStyles.compactStatUnit}> kg</Text>
            </Text>
          </View>
        ) : (
          <View style={cardStyles.statRow}>
            <StatCell label="DURATION" value={duration} />
            <StatCell label="VOLUME" value={volume} unit=" kg" />
            <StatCell label="SETS" value={sets} />
          </View>
        )}

        {layout === 'standard' && workout.exercises.length > 0 && (
          <View style={cardStyles.exerciseList}>
            {workout.exercises.slice(0, 3).map((we) => (
              <Text key={we.id} style={cardStyles.exerciseLine} numberOfLines={1}>
                {we.exercise.name}
              </Text>
            ))}
          </View>
        )}

        {layout === 'detailed' && workout.exercises.length > 0 && (
          <View style={cardStyles.detailedList}>
            {workout.exercises.slice(0, 6).map((we) => (
              <View key={we.id} style={cardStyles.detailedRow}>
                <Text style={cardStyles.detailedName} numberOfLines={1}>
                  {we.exercise.name}
                </Text>
                <Text style={cardStyles.detailedBest}>{bestLine(we.sets)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* PR chip (only when there are PRs) */}
      {prs.length > 0 && layout !== 'compact' && (
        <View style={cardStyles.prChipWrap}>
          <View style={cardStyles.prChip}>
            <StarIcon size={12} color={color.success} strokeWidth={2.4} />
            <Text style={cardStyles.prChipText}>{`${prs.length} PR${prs.length === 1 ? '' : 's'}`}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function StatCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={cardStyles.statCell}>
      <Text style={cardStyles.statLabel}>{label}</Text>
      <Text style={cardStyles.statValue}>
        {value}
        {unit ? <Text style={cardStyles.statUnit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.border,
    maxHeight: '94%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  grabberWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 4,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.surface3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  title: {
    fontFamily: font.titleSemi,
    fontSize: 17,
    letterSpacing: -0.17,
    color: color.text1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  previewShot: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
  },
  emptyPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontFamily: font.titleSemi,
    fontSize: 17,
    color: color.text1,
  },
  emptySub: {
    fontFamily: font.bodyRegular,
    fontSize: 13,
    color: color.text3,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flex: 1,
    minHeight: 38,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: color.accent,
    backgroundColor: 'rgba(255,74,28,0.12)',
  },
  chipText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    fontWeight: '600',
    color: color.text2,
  },
  chipTextActive: {
    color: color.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  saveBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
    letterSpacing: -0.14,
  },
  shareBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: color.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareBtnText: {
    fontFamily: font.displayBold,
    fontSize: 16,
    color: color.accentFg,
    letterSpacing: -0.16,
  },
  actionDisabled: {
    opacity: 0.5,
  },
  disabledText: {
    color: color.text3,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#0F0F13',
    borderRadius: 22,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,74,28,0.12)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    fontVariant: tabular,
    letterSpacing: 0.5,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
  },
  name: {
    fontFamily: font.displayBold,
    letterSpacing: -0.48,
    color: color.text1,
  },
  statRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  statCell: {
    gap: 4,
    minWidth: 70,
  },
  statLabel: {
    fontFamily: font.monoMedium,
    fontSize: 9,
    letterSpacing: 1.1,
    color: color.text3,
  },
  statValue: {
    fontFamily: font.monoSemi,
    fontSize: 17,
    letterSpacing: -0.34,
    color: color.text1,
    fontVariant: tabular,
  },
  statUnit: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    color: color.text3,
  },
  compactStat: {
    gap: 6,
  },
  compactStatLabel: {
    fontFamily: font.monoMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: color.text3,
  },
  compactStatValue: {
    fontFamily: font.monoBold,
    fontSize: 19,
    letterSpacing: -0.38,
    color: color.text1,
    fontVariant: tabular,
  },
  compactStatUnit: {
    fontFamily: font.monoMedium,
    fontSize: 12,
    color: color.text3,
  },
  exerciseList: {
    gap: 3,
    marginTop: 4,
  },
  exerciseLine: {
    fontFamily: font.monoMedium,
    fontSize: 12,
    color: color.text2,
  },
  detailedList: {
    gap: 6,
    marginTop: 4,
  },
  detailedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: color.hair,
    paddingTop: 6,
    gap: 12,
  },
  detailedName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.bodyMedium,
    fontSize: 12,
    color: color.text2,
  },
  detailedBest: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    fontVariant: tabular,
  },
  prChipWrap: {
    flexDirection: 'row',
  },
  prChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(45,216,129,0.12)',
  },
  prChipText: {
    fontFamily: font.monoSemi,
    fontSize: 10.5,
    color: color.success,
    fontVariant: tabular,
  },
});

