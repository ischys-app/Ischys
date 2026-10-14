/**
 * The body diagram (#66).
 *
 * Tinted by how much each region has been worked, and deliberately NOT a heat
 * map: the purpose is spotting what's been neglected, and a red-hot chest tells
 * you nothing you didn't already know. Worked regions climb a neutral grey
 * ramp; the ones that stand out are the untouched ones, outlined in warning.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

import { BODY_BACK, BODY_FRONT, BODY_SILHOUETTE, BODY_VIEWBOX, type BodyShape } from '../data/bodyMap';
import { isNeglected, tintFor, type MuscleTint } from '../domain/muscleMap';
import { color, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';

/** Neutral ramp — more work reads as brighter, never as hotter. */
const TINT: Record<MuscleTint, string> = themed(() => ({
  none: color.surface3,
  low: color.text3,
  medium: color.text2,
  high: color.text1,
}));

type Props = {
  side: 'front' | 'back';
  /** Region key -> weighted sets per week, from `aggregateMuscleWork`. */
  work: Map<string, number>;
  /** Days of training history, for the neglect rule. */
  historyDays: number;
  hidden?: Set<string>;
  /** Tapping a region opens its breakdown. Omitted → the diagram is inert. */
  onPressRegion?: (region: string) => void;
  width?: number;
};

function Shape({
  shape,
  fill,
  stroke,
  onPress,
}: {
  shape: BodyShape;
  fill: string;
  stroke?: string;
  onPress?: () => void;
}) {
  useThemed();
  // `onPress` on an SVG primitive gives a tap target the exact shape of the
  // muscle, which a wrapping View could not.
  const common = {
    fill,
    stroke,
    strokeWidth: stroke ? 1 : 0,
    strokeDasharray: stroke ? '2 2' : undefined,
    onPress,
  } as const;
  if (shape.d) return <Path d={shape.d} {...common} />;
  if (shape.r) {
    const [x, y, w, h, rx] = shape.r;
    return <Rect x={x} y={y} width={w} height={h} rx={rx} {...common} />;
  }
  if (shape.e) {
    const [cx, cy, rx, ry] = shape.e;
    return <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...common} />;
  }
  return null;
}

export const BodyMap = memo(function BodyMap({
  side,
  work,
  historyDays,
  hidden,
  onPressRegion,
  width = 150,
}: Props) {
  useThemed();
  const shapes = side === 'front' ? BODY_FRONT : BODY_BACK;
  const height = (width / BODY_VIEWBOX.width) * BODY_VIEWBOX.height;

  return (
    <View style={styles.wrap}>
      <Svg width={width} height={height} viewBox={`0 0 ${BODY_VIEWBOX.width} ${BODY_VIEWBOX.height}`}>
        {/* Head, hands, feet first so muscles draw over them. */}
        {BODY_SILHOUETTE.map((s, i) => (
          <Shape key={`body-${i}`} shape={s} fill={color.surface2} />
        ))}
        {shapes.map((s, i) => {
          const region = s.m ?? '';
          const isHidden = !!hidden?.has(region);
          const sets = work.get(region) ?? 0;
          const neglected = isNeglected(sets, historyDays, isHidden);
          return (
            <Shape
              key={`${region}-${i}`}
              shape={s}
              fill={isHidden ? color.surface2 : TINT[tintFor(sets)]}
              stroke={neglected ? color.warning : undefined}
              onPress={onPressRegion && region ? () => onPressRegion(region) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
