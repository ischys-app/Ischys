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

import { color, font, space, TAP_TARGET, type } from '../theme/tokens';

export function Screen({
  children,
  style,
  edges,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  edges?: readonly Edge[];
}) {
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
  const isPrimary = variant === 'primary';
  const inert = disabled || loading;
  return (
    <Pressable
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primary : styles.ghost,
        inert && styles.inert,
        pressed && !inert && styles.pressed,
      ]}
    >
      {loading ? (
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
      )}
    </Pressable>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
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
  buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buttonLabel: { fontFamily: font.displayBold, fontSize: 16, letterSpacing: -0.16, color: color.accentFg },
  ghostLabel: { fontFamily: font.titleSemi, fontSize: 14.5, color: color.text2 },
  label: {
    ...type.label,
    color: color.text3,
    textTransform: 'uppercase',
  },
});
