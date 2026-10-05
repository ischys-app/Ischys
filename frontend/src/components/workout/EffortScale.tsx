/**
 * The effort scale: one bar you tap or drag (board 14a, decision C).
 *
 * RPE needs nine values, and at 390pt the rest bar has 342pt inside it — nine
 * 44pt chips cannot fit. So the whole bar is the target: 44pt tall, full
 * width, and whichever cell is under the thumb is the value. Harder is on the
 * right on both scales, so switching between them never flips where the thumb
 * goes.
 *
 * The selected cell is a surface with a text1 ring, never the accent: in the
 * rest bar the accent already means REST, Skip and the progress line.
 *
 * A touch previews (a tick per cell crossed) and lifting commits, so a tap is
 * one tick and one save. Dragging well off the bar and letting go cancels,
 * and so does a touch the system takes away (a call, a system gesture).
 */
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';

import {
  effortLabel,
  effortSteps,
  releasedStep,
  selectedStep,
  stepAt,
  type EffortScaleKind,
  type EffortTouchEnd,
} from '../../domain/effort';
import { haptics } from '../../lib/haptics';
import { color, font } from '../../theme/tokens';

type Props = {
  kind: EffortScaleKind;
  /** The stored rating (always RPE), or null when the set is unrated. */
  value: number | null;
  /** `bar` is the rest bar's 44pt; `sheet` is the 52pt one with larger figures. */
  size?: 'bar' | 'sheet';
  /** The value under the thumb while touching; null once the touch is over. */
  onPreview?: (rpe: number | null) => void;
  /** The touch ended on a value. */
  onCommit: (rpe: number) => void;
};

/** How far above or below the bar a lifted finger still counts as a choice. */
const CANCEL_SLOP = 40;

export function EffortScale({ kind, value, size = 'bar', onPreview, onCommit }: Props) {
  const steps = effortSteps(kind);
  const [active, setActive] = useState<number | null>(null);
  // The gesture callbacks outlive a render, so what they read lives in refs.
  const activeRef = useRef<number | null>(null);
  const layout = useRef({ width: 0, height: 0 });
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const handlers = useRef({ onPreview, onCommit });
  handlers.current = { onPreview, onCommit };

  const moveTo = (x: number) => {
    const list = stepsRef.current;
    const i = stepAt(x, layout.current.width, list.length);
    if (i === activeRef.current) return;
    activeRef.current = i;
    setActive(i);
    haptics.select(); // one tick per step
    handlers.current.onPreview?.(list[i].rpe);
  };

  // Whether the last finger was seen coming off the glass. A tap never becomes
  // a drag, so its end looks the same as a touch the system took away; this is
  // what tells them apart.
  const fingerUp = useRef(false);

  const finish = (end: EffortTouchEnd, y: number) => {
    const i = releasedStep({
      active: activeRef.current,
      end,
      fingerUp: fingerUp.current,
      y,
      height: layout.current.height,
      slop: CANCEL_SLOP,
    });
    activeRef.current = null;
    fingerUp.current = false;
    setActive(null);
    handlers.current.onPreview?.(null);
    // Cancelled, or dragged away: the preview is gone and nothing is saved.
    if (i != null) handlers.current.onCommit(stepsRef.current[i].rpe);
  };

  // Runs on the JS thread: there is no animation to drive, only a cell index.
  // `minDistance(0)` lets this take the touch before a sheet's own pan can.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onTouchesDown(() => {
      fingerUp.current = false;
    })
    .onTouchesUp((e) => {
      fingerUp.current = e.numberOfTouches === 0;
    })
    .onTouchesCancelled(() => {
      fingerUp.current = false;
    })
    .onBegin((e) => moveTo(e.x))
    .onUpdate((e) => moveTo(e.x))
    .onFinalize((e) =>
      finish(e.state === State.END ? 'ended' : e.state === State.CANCELLED ? 'cancelled' : 'failed', e.y),
    );

  const shown = active ?? selectedStep(value, kind);
  const big = size === 'sheet';
  const current = active != null ? steps[active].rpe : value;

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.bar, big && styles.barSheet]}
        onLayout={(e) => {
          // The cells sit inside the 1pt border.
          layout.current = {
            width: e.nativeEvent.layout.width - 2,
            height: e.nativeEvent.layout.height,
          };
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={kind === 'rir' ? 'Reps in reserve' : 'Rate of perceived exertion'}
        accessibilityValue={{ text: current != null ? effortLabel(current, kind) : 'Not rated' }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const from = selectedStep(value, kind);
          const dir = e.nativeEvent.actionName === 'increment' ? 1 : -1;
          // Unrated: start from the middle of the scale, not from an end.
          const base = from === -1 ? Math.floor(steps.length / 2) - dir : from;
          const next = Math.max(0, Math.min(steps.length - 1, base + dir));
          if (next === from) return;
          haptics.select();
          onCommit(steps[next].rpe);
        }}
      >
        {steps.map((step, i) => {
          const selected = i === shown;
          return (
            <View key={step.label} style={[styles.cell, i > 0 && styles.cellDivider, selected && styles.cellOn]}>
              {selected ? <View style={styles.ring} pointerEvents="none" /> : null}
              <Text
                style={[
                  styles.label,
                  big && styles.labelSheet,
                  step.half && styles.labelHalf,
                  selected && styles.labelOn,
                ]}
                numberOfLines={1}
                allowFontScaling={false}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 10,
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
    overflow: 'hidden',
  },
  barSheet: { height: 52, borderRadius: 12 },
  cell: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: color.hair },
  cellOn: { backgroundColor: color.surface3 },
  // The board's `inset 0 0 0 1.5px text1`, drawn as a border on an overlay so
  // it does not move the label.
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 1.5,
    borderColor: color.text1,
  },
  label: {
    fontFamily: font.monoSemi,
    fontSize: 13.5,
    color: color.text2,
    fontVariant: ['tabular-nums'],
  },
  labelSheet: { fontSize: 15 },
  // Half steps are smaller and dimmer, so the whole numbers are easy to find.
  labelHalf: { fontSize: 10.5, color: color.text3 },
  labelOn: { color: color.text1 },
});
