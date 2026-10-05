/**
 * The three sheets of Edit Workout (#83, board 13a): the date / start /
 * duration picker (E4), the save confirmation shown only when a record moves
 * (E5), and the discard confirmation (E6). One shell, drawn once.
 *
 * The pickers are wheels built on a plain ScrollView: the project has no
 * native date picker, and a duration in hours and minutes is not something a
 * system date picker offers anyway.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Unit } from '../../domain/units';
import {
  MONTH_NAMES,
  clampWhen,
  clampWhileTurning,
  daysInMonth,
  durationFromParts,
  durationParts,
  endsAt,
  fmtClock,
  fmtHoursMinutes,
  fmtLongDate,
  recordRow,
  startFromParts,
  startParts,
  type RecordChange,
  type When,
} from '../../domain/workoutEdit';
import { haptics } from '../../lib/haptics';
import { color, font } from '../../theme/tokens';
import { DraggableSheet } from '../DraggableSheet';
import { PressableScale } from '../PressableScale';
import { StarIcon } from '../icons';

// --- shell -------------------------------------------------------------------

type ShellProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  children?: ReactNode;
  primary: { label: string; onPress: () => void; tone?: 'accent' | 'error'; disabled?: boolean };
  secondary: { label: string; onPress: () => void };
};

function EditSheet({ visible, onClose, title, body, children, primary, secondary }: ShellProps) {
  const insets = useSafeAreaInsets();
  return (
    <DraggableSheet
      visible={visible}
      onClose={onClose}
      // 34 is the board's bottom padding, which is the home-indicator inset.
      sheetStyle={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 34) }]}
      // The pickers and the record list scroll, so only the heading drags.
      handleOnly
    >
      <View>
        <View style={styles.grabber} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {children}
      <View style={styles.actions}>
        <PressableScale
          onPress={primary.onPress}
          disabled={primary.disabled}
          style={[styles.primary, primary.tone === 'error' && styles.primaryError]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, primary.tone === 'error' && styles.primaryTextError]}>
            {primary.label}
          </Text>
        </PressableScale>
        <Pressable
          onPress={secondary.onPress}
          style={({ pressed }) => [styles.secondary, pressed && styles.secondaryPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>
      </View>
    </DraggableSheet>
  );
}

// --- wheel -------------------------------------------------------------------

const WHEEL_HEIGHT = 150;
const WHEEL_ITEM = 36;
const WHEEL_PAD = (WHEEL_HEIGHT - WHEEL_ITEM) / 2; // 57: the highlight bar's top

type WheelProps = {
  items: readonly string[];
  index: number;
  onChange: (index: number) => void;
  width: number;
  accessibilityLabel: string;
};

/**
 * One column. The value under the highlight bar is the selection; it reports
 * each step as it passes, with a tick, so what the sheet derives from it — the
 * end time — follows the finger. When the parent answers with a different
 * index (a future date pulled back to today), the column goes there once it
 * has come to rest, never mid-drag.
 */
function Wheel({ items, index, onChange, width, accessibilityLabel }: WheelProps) {
  const ref = useRef<ScrollView>(null);
  const safe = Math.min(Math.max(index, 0), items.length - 1);
  const [shown, setShown] = useState(safe);
  const shownRef = useRef(safe);
  const wanted = useRef(safe);
  wanted.current = safe;
  const moving = useRef(false);

  const settle = () => {
    moving.current = false;
    if (wanted.current !== shownRef.current) {
      shownRef.current = wanted.current;
      setShown(wanted.current);
    }
    ref.current?.scrollTo({ y: wanted.current * WHEEL_ITEM, animated: true });
  };

  useEffect(() => {
    if (moving.current || safe === shownRef.current) return;
    shownRef.current = safe;
    setShown(safe);
    ref.current?.scrollTo({ y: safe * WHEEL_ITEM, animated: true });
  }, [safe]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!moving.current) return;
    const at = Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM);
    const next = Math.min(Math.max(at, 0), items.length - 1);
    if (next === shownRef.current) return;
    shownRef.current = next;
    setShown(next);
    haptics.select();
    onChange(next);
  };

  return (
    <ScrollView
      ref={ref}
      style={[styles.wheel, { width }]}
      contentContainerStyle={styles.wheelContent}
      contentOffset={{ x: 0, y: safe * WHEEL_ITEM }}
      // Android ignores `contentOffset`; this puts it in place there.
      onLayout={() => ref.current?.scrollTo({ y: shownRef.current * WHEEL_ITEM, animated: false })}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM}
      decelerationRate="fast"
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScroll={onScroll}
      onScrollBeginDrag={() => {
        moving.current = true;
      }}
      onScrollEndDrag={(e) => {
        // No fling: there will be no momentum event to settle on.
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle();
      }}
      onMomentumScrollEnd={settle}
      accessibilityLabel={accessibilityLabel}
    >
      {items.map((label, i) => (
        <Pressable
          key={label + i}
          style={styles.wheelItem}
          onPress={() => {
            if (i === shownRef.current) return;
            shownRef.current = i;
            setShown(i);
            haptics.select();
            onChange(i);
            ref.current?.scrollTo({ y: i * WHEEL_ITEM, animated: true });
          }}
        >
          {/* The board shows the selection and one row either side; further
              rows would be cut in half by the wheel's edge, over the ENDS line. */}
          <Text
            style={[
              i === shown ? styles.wheelSelected : styles.wheelText,
              Math.abs(i - shown) > 1 && styles.wheelFar,
            ]}
          >
            {label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

const HOURS = range(0, 23).map(pad2);
const MINUTES = range(0, 59).map(pad2);
const DURATION_HOURS = range(0, 23).map(String);
const DURATION_MINUTES = range(0, 59).map(String);

// --- E4 · date, start, duration ----------------------------------------------

export type WhenField = 'date' | 'start' | 'duration';

type WhenSheetProps = {
  /** Which cell was tapped; null keeps the sheet closed. */
  field: WhenField | null;
  /** The working values the sheet opens on. */
  when: When;
  /** The workout as stored, for "WAS" and so untouched wheels change nothing. */
  stored: When & { endedAt: number | null };
  onDone: (when: When) => void;
  onClose: () => void;
};

export function WhenSheet({ field, when, stored, onDone, onClose }: WhenSheetProps) {
  const [active, setActive] = useState<WhenField>(field ?? 'duration');
  const [draft, setDraft] = useState<When>(when);

  // A fresh open starts from the working values and the tapped cell. Adjusted
  // during render, not in an effect, so the wheels mount already in place
  // instead of mounting on the last open's values and then scrolling.
  const [seen, setSeen] = useState<WhenField | null>(field);
  if (field !== seen) {
    setSeen(field);
    if (field != null) {
      setActive(field);
      setDraft(when);
    }
  }

  const parts = startParts(draft.startedAt);
  const length = durationParts(draft.durationSeconds);

  const thisYear = new Date().getFullYear();
  const firstYear = Math.min(startParts(stored.startedAt).year, thisYear) - 20;
  const years = useMemo(() => range(firstYear, thisYear).map(String), [firstYear, thisYear]);
  const days = useMemo(
    () => range(1, daysInMonth(parts.year, parts.month)).map(String),
    [parts.year, parts.month],
  );

  /** Every wheel change goes through the same rule: no start in the future. */
  const apply = (next: When) =>
    setDraft(clampWhileTurning(next, Date.now(), stored.durationSeconds));
  /** And on Done the end is held to now as well, by shortening the duration. */
  const confirm = () => {
    const untouched =
      draft.startedAt === when.startedAt && draft.durationSeconds === when.durationSeconds;
    onDone(untouched ? when : clampWhen(draft, Date.now(), stored.durationSeconds));
  };
  const setStart = (patch: Partial<typeof parts>) =>
    apply({
      startedAt: startFromParts({ ...parts, ...patch }, stored.startedAt),
      durationSeconds: draft.durationSeconds,
    });
  const setLength = (hours: number, minutes: number) =>
    apply({
      startedAt: draft.startedAt,
      durationSeconds: durationFromParts(hours, minutes, stored.durationSeconds),
    });

  const storedEnd = stored.endedAt ?? endsAt(stored.startedAt, stored.durationSeconds);
  const end = endsAt(draft.startedAt, draft.durationSeconds);
  const endMoved = fmtClock(end) !== fmtClock(storedEnd);

  const rows: { key: WhenField; label: string; value: string }[] = [
    { key: 'date', label: 'Date', value: fmtLongDate(draft.startedAt) },
    { key: 'start', label: 'Start', value: fmtClock(draft.startedAt) },
    { key: 'duration', label: 'Duration', value: fmtHoursMinutes(draft.durationSeconds) },
  ];

  return (
    <EditSheet
      visible={field != null}
      onClose={onClose}
      title="Date & time"
      body="Changing the date moves this workout in History."
      primary={{ label: 'Done', onPress: confirm }}
      secondary={{ label: 'Cancel', onPress: onClose }}
    >
      <View style={styles.rows}>
        {rows.map((r) => (
          <Pressable
            key={r.key}
            style={styles.row}
            onPress={() => setActive(r.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active === r.key }}
            accessibilityLabel={`${r.label}, ${r.value}`}
          >
            <Text style={styles.rowLabel}>{r.label}</Text>
            <View style={[styles.rowValue, active === r.key && styles.rowValueActive]}>
              <Text style={styles.rowValueText}>{r.value}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.wheels}>
        <View style={styles.wheelBar} pointerEvents="none" />
        {active === 'date' ? (
          <>
            <Wheel
              key="day"
              items={days}
              index={parts.day - 1}
              onChange={(i) => setStart({ day: i + 1 })}
              width={44}
              accessibilityLabel="Day"
            />
            <Wheel
              key="month"
              items={MONTH_NAMES}
              index={parts.month}
              onChange={(i) => setStart({ month: i })}
              width={56}
              accessibilityLabel="Month"
            />
            <Wheel
              key="year"
              items={years}
              index={parts.year - firstYear}
              onChange={(i) => setStart({ year: firstYear + i })}
              width={64}
              accessibilityLabel="Year"
            />
          </>
        ) : active === 'start' ? (
          <>
            <Wheel
              key="hour"
              items={HOURS}
              index={parts.hour}
              onChange={(i) => setStart({ hour: i })}
              width={44}
              accessibilityLabel="Hour"
            />
            <Text style={styles.wheelUnit}>:</Text>
            <Wheel
              key="minute"
              items={MINUTES}
              index={parts.minute}
              onChange={(i) => setStart({ minute: i })}
              width={44}
              accessibilityLabel="Minute"
            />
          </>
        ) : (
          <>
            <Wheel
              key="dh"
              items={DURATION_HOURS}
              index={length.hours}
              onChange={(i) => setLength(i, length.minutes)}
              width={44}
              accessibilityLabel="Hours"
            />
            <Text style={styles.wheelUnit}>h</Text>
            <Wheel
              key="dm"
              items={DURATION_MINUTES}
              index={length.minutes}
              onChange={(i) => setLength(length.hours, i)}
              width={44}
              accessibilityLabel="Minutes"
            />
            <Text style={styles.wheelUnit}>min</Text>
          </>
        )}
      </View>

      {/* Derived, never edited: the three fields above cannot contradict it. */}
      <Text style={styles.ends}>
        {endMoved ? `ENDS ${fmtClock(end)} · WAS ${fmtClock(storedEnd)}` : `ENDS ${fmtClock(end)}`}
      </Text>
    </EditSheet>
  );
}

// --- E5 · save, a record changes ---------------------------------------------

type SaveSheetProps = {
  visible: boolean;
  changes: readonly RecordChange[];
  unit: Unit;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
};

export function SaveRecordsSheet({ visible, changes, unit, saving, onSave, onClose }: SaveSheetProps) {
  return (
    <EditSheet
      visible={visible}
      onClose={onClose}
      title="Save changes?"
      body="This changes your records. The new values come from your full history."
      primary={{ label: 'Save changes', onPress: onSave, disabled: saving }}
      secondary={{ label: 'Keep editing', onPress: onClose }}
    >
      <ScrollView
        style={styles.records}
        contentContainerStyle={styles.recordsContent}
        showsVerticalScrollIndicator={false}
      >
        {changes.map((c) => {
          const row = recordRow(c, unit);
          // Success appears only on a record gained. A lost one stays neutral.
          const tone = row.gained ? color.success : color.text2;
          return (
            <View key={`${c.exerciseId}-${c.metric}`} style={styles.record}>
              <View style={styles.recordHead}>
                <StarIcon size={13} color={tone} strokeWidth={2.4} />
                <Text style={styles.recordName} numberOfLines={1}>
                  {c.exerciseName}
                </Text>
              </View>
              <View style={styles.recordValues}>
                <Text style={styles.recordMetric}>{row.metric}</Text>
                <Text style={styles.recordTo} numberOfLines={1}>
                  <Text style={styles.recordFrom}>{`${row.from} → `}</Text>
                  {row.to}
                </Text>
              </View>
              <Text style={[styles.recordNote, row.gained && styles.recordNoteGained]}>
                {row.note}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </EditSheet>
  );
}

// --- E6 · cancel with changes ------------------------------------------------

type DiscardSheetProps = {
  visible: boolean;
  changeCount: number;
  onDiscard: () => void;
  onClose: () => void;
};

export function DiscardSheet({ visible, changeCount, onDiscard, onClose }: DiscardSheetProps) {
  const what = changeCount === 1 ? '1 change' : `${changeCount} changes`;
  return (
    <EditSheet
      visible={visible}
      onClose={onClose}
      title="Discard changes?"
      body={`${what} to this workout won’t be saved. The workout stays as it was.`}
      primary={{ label: 'Discard changes', onPress: onDiscard, tone: 'error' }}
      secondary={{ label: 'Keep editing', onPress: onClose }}
    />
  );
}

const tabular: ['tabular-nums'] = ['tabular-nums'];

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: color.surface1,
    borderTopWidth: 1,
    borderTopColor: color.border,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 18,
    maxHeight: '90%',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.surface3,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: { fontFamily: font.titleSemi, fontSize: 20, letterSpacing: -0.2, color: color.text1 },
  body: {
    fontFamily: font.bodyRegular,
    fontSize: 14,
    lineHeight: 21,
    color: color.text2,
    marginTop: 6,
  },
  actions: { gap: 10, marginTop: 18 },
  primary: {
    height: 50,
    borderRadius: 12,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryError: { backgroundColor: color.error },
  primaryText: { fontFamily: font.displayBold, fontSize: 15, color: color.accentFg },
  primaryTextError: { color: '#fff' },
  secondary: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPressed: { borderColor: color.text3 },
  secondaryText: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text1 },

  // E4
  rows: { marginTop: 14, borderTopWidth: 1, borderTopColor: color.hair },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  rowLabel: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text1 },
  rowValue: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: color.surface2,
    justifyContent: 'center',
  },
  rowValueActive: { backgroundColor: color.surface3 },
  rowValueText: {
    fontFamily: font.monoSemi,
    fontSize: 14,
    color: color.text1,
    fontVariant: tabular,
  },
  wheels: {
    height: WHEEL_HEIGHT,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  wheelBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: WHEEL_PAD,
    height: WHEEL_ITEM,
    borderRadius: 9,
    backgroundColor: color.surface2,
  },
  wheel: { height: WHEEL_HEIGHT, flexGrow: 0 },
  wheelContent: { paddingVertical: WHEEL_PAD },
  wheelItem: { height: WHEEL_ITEM, alignItems: 'center', justifyContent: 'center' },
  wheelText: {
    fontFamily: font.monoRegular,
    fontSize: 16,
    color: color.text3,
    fontVariant: tabular,
  },
  wheelFar: { opacity: 0 },
  wheelSelected: {
    fontFamily: font.monoSemi,
    fontSize: 20,
    color: color.text1,
    fontVariant: tabular,
  },
  wheelUnit: { fontFamily: font.monoRegular, fontSize: 13, color: color.text3 },
  ends: {
    fontFamily: font.monoRegular,
    fontSize: 11.5,
    color: color.text3,
    textAlign: 'center',
    marginBottom: 14,
    fontVariant: tabular,
  },

  // E5
  records: { marginTop: 16, flexGrow: 0, flexShrink: 1 },
  recordsContent: { gap: 8 },
  record: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recordHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordName: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.titleSemi,
    fontSize: 14,
    color: color.text1,
  },
  recordValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
  },
  recordMetric: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    letterSpacing: 1,
    color: color.text3,
    fontVariant: tabular,
  },
  recordTo: {
    flexShrink: 1,
    fontFamily: font.monoRegular,
    fontSize: 13,
    color: color.text1,
    fontVariant: tabular,
  },
  recordFrom: { color: color.text3 },
  recordNote: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 4,
  },
  recordNoteGained: { color: color.success },
});
