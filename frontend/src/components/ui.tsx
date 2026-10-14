/** Minimal shared primitives in the Ischys token language. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';

import { color, font, space, TAP_TARGET, themed, type } from '../theme/tokens';
import { CheckIcon } from './icons';
import { PressableScale } from './PressableScale';
import { useThemed } from '../theme/ThemeProvider';

export function Screen({
  children,
  style,
  edges,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: readonly Edge[];
}) {
  useThemed();
  return (
    <SafeAreaView style={styles.screen} edges={edges}>
      <View style={[styles.screenInner, style]}>{children}</View>
    </SafeAreaView>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
};

/** Primary = the accent action; ghost = secondary. Accent is reserved for the one action. */
export function Button({ label, onPress, variant = 'primary', loading, disabled, icon }: ButtonProps) {
  useThemed();
  const isPrimary = variant === 'primary';
  const inert = disabled || loading;
  const content = loading ? (
    <ActivityIndicator color={isPrimary ? color.accentFg : color.text2} />
  ) : (
    <View style={styles.buttonRow}>
      {icon}
      <Text
        style={[
          isPrimary ? styles.buttonLabel : styles.ghostLabel,
          inert && isPrimary && { color: color.text3 },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  // Primary = the one accent action; press-scale it (the ghost keeps its opacity).
  if (isPrimary) {
    return (
      <PressableScale
        onPress={inert ? undefined : onPress}
        disabled={inert}
        style={[styles.button, styles.primary, inert && styles.inert]}
      >
        {content}
      </PressableScale>
    );
  }

  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        styles.ghost,
        inert && styles.inert,
        pressed && !inert && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

/**
 * The 24pt selection circle: an unselected ring that advertises a tappable row,
 * an accent disc with a check when it is on. Shared so every multi-select list
 * (Add Exercise, routines-from-import) reads as the same control.
 */
export function SelectCircle({ selected }: { selected: boolean }) {
  useThemed();
  return (
    <View
      style={[
        styles.selectCircle,
        selected
          ? { borderColor: color.accent, backgroundColor: color.accent }
          : { borderColor: color.text3 },
      ]}
    >
      {selected ? <CheckIcon size={13} color={color.accentFg} strokeWidth={3.4} /> : null}
    </View>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  useThemed();
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: color.bg },
    screenInner: { flex: 1, paddingHorizontal: space.lg },
    button: {
      height: 54,
      minHeight: TAP_TARGET,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: space.md,
    },
    primary: { backgroundColor: color.accent },
    ghost: {
      height: 50,
      borderRadius: 12,
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
    },
    inert: { backgroundColor: color.surface2, borderColor: color.border },
    pressed: { opacity: 0.85 },
    // 24pt ring, 1.5px border — present whether or not the row is selected, so the
    // row advertises that tapping it does something.
    selectCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    buttonLabel: { fontFamily: font.displayBold, fontSize: 16, letterSpacing: -0.16, color: color.accentFg },
    ghostLabel: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text2 },
    label: {
      ...type.label,
      color: color.text3,
      textTransform: 'uppercase',
    },
  }),
);

export type SegmentOption<T extends string> = { label: string; value: T };

/**
 * Two-or-more-option segmented control. Lifted out of the Settings units row so
 * the import screen's unit question uses the same control the user already knows,
 * rather than a lookalike.
 */
export function Segment<T extends string>({
  options,
  value,
  onChange,
  style,
  padX = 12,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: ViewStyle;
  /** Horizontal padding per option; three options fit a row at 9. */
  padX?: number;
}) {
  useThemed();
  return (
    <View style={[segmentStyles.segment, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              segmentStyles.option,
              { paddingHorizontal: padX },
              selected && segmentStyles.optionSelected,
            ]}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
          >
            <Text style={[segmentStyles.text, selected && segmentStyles.textSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const segmentStyles = themed(() =>
  StyleSheet.create({
    segment: {
      flexDirection: 'row',
      backgroundColor: color.surface2,
      borderRadius: 8,
      padding: 3,
      gap: 2,
      flexShrink: 0,
    },
    option: {
      height: 26,
      paddingHorizontal: 12,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionSelected: { backgroundColor: color.segSel },
    text: {
      fontFamily: font.monoSemi,
      fontSize: 12,
      fontWeight: '600',
      color: color.text3,
    },
    textSelected: { color: color.text1 },
  }),
);
