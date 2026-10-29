import { StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { ProfileRow } from '../domain/profiles';
import { firstName } from '../domain/profiles';
import { color, font, themed } from '../theme/tokens';
import { textScale } from '../theme/textScale';
import { useThemed } from '../theme/ThemeProvider';
import { ProfileAvatar } from './ProfileAvatar';

/**
 * Whose setting a section holds, with 2+ profiles (#117, P9): the profile's
 * initials chip and first name, or a phone glyph and THIS PHONE.
 */
export type SectionScope = { kind: 'profile'; profile: ProfileRow } | { kind: 'device' };

/** Mono section eyebrow: e.g. QUICK START, MY ROUTINES, RECENT. */
export function SectionLabel({
  children,
  style,
  scope,
}: {
  children: React.ReactNode;
  style?: TextStyle;
  scope?: SectionScope;
}) {
  useThemed();
  if (!scope) {
    return <Text maxFontSizeMultiplier={textScale.control} style={[styles.label, style]}>{children}</Text>;
  }
  const who = scope.kind === 'profile' ? firstName(scope.profile.name) || scope.profile.name : 'THIS PHONE';
  return (
    <View
      // With a scope the label is a row: `style` places the row (padding, margin).
      style={[styles.scopeRow, style as ViewStyle]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${who}, ${typeof children === 'string' ? children : ''}`}
    >
      {scope.kind === 'profile' ? <ProfileAvatar profile={scope.profile} size={18} /> : <PhoneGlyph />}
      <Text maxFontSizeMultiplier={textScale.control} numberOfLines={1} style={[styles.label, styles.who]}>
        {who}
      </Text>
      <Text maxFontSizeMultiplier={textScale.control} style={styles.label}>·</Text>
      <Text maxFontSizeMultiplier={textScale.control} numberOfLines={1} style={[styles.label, styles.title]}>
        {children}
      </Text>
    </View>
  );
}

/** 13pt phone outline, the THIS PHONE prefix. */
function PhoneGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={3} width={10} height={18} rx={2} stroke={color.text3} strokeWidth={2.2} />
      <Path d="M11 18h2" stroke={color.text3} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    label: {
      fontFamily: font.monoRegular,
      fontSize: 11,
      letterSpacing: 1.54,
      color: color.text3,
      textTransform: 'uppercase',
    },
    scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    who: { fontFamily: font.monoSemi, color: color.text2, flexShrink: 1 },
    title: { flexShrink: 1 },
  }),
);
