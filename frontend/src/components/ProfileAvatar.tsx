/**
 * A profile's initials in a rounded square (#117, handoff "ProfileAvatar").
 * Initials only, never a colour: profiles are told apart by name.
 *
 *   size  radius  initials           where
 *   18    5       mono 8/700         workout and Summary header chip, Settings scope prefix
 *   24    7       mono 9.5/700       tab bar item (variant `outline`)
 *   40    11      mono 13/700        switcher, Manage, Settings rows
 *   62    18      mono 22/700        Profile tab identity row
 *   84    24      mono 30/700        Add profile preview
 *
 * `fill` is `surface3` with a 1px `border`. `outline` is no fill and a 1.8pt
 * line in `tint`. `dashed` is the Add profile slot: a 1.5pt dashed `border`
 * and a plus in `text2`. `tint` colours the initials (and the outline); it
 * defaults to `text1`.
 */
import { StyleSheet, Text, View } from 'react-native';

import { textScale } from '../theme/textScale';
import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';
import { PlusIcon } from './icons';

export type ProfileAvatarSize = 18 | 24 | 40 | 62 | 84;

const SPEC: Record<ProfileAvatarSize, { radius: number; fontSize: number; letterSpacing: number }> = {
  18: { radius: 5, fontSize: 8, letterSpacing: 0 },
  24: { radius: 7, fontSize: 9.5, letterSpacing: -0.19 },
  40: { radius: 11, fontSize: 13, letterSpacing: 0 },
  62: { radius: 18, fontSize: 22, letterSpacing: 0 },
  84: { radius: 24, fontSize: 30, letterSpacing: 0 },
};

type Props = {
  profile: { initials: string };
  size: ProfileAvatarSize;
  variant?: 'fill' | 'outline' | 'dashed';
  tint?: string;
};

export function ProfileAvatar({ profile, size, variant = 'fill', tint }: Props) {
  useThemed();
  const spec = SPEC[size];
  const box = { width: size, height: size, borderRadius: spec.radius };

  if (variant === 'dashed') {
    return (
      <View style={[styles.base, styles.dashed, box]}>
        <PlusIcon size={16} color={color.text2} strokeWidth={2.4} />
      </View>
    );
  }

  const ink = tint ?? color.text1;
  return (
    <View
      style={[styles.base, variant === 'outline' ? [styles.outline, { borderColor: ink }] : styles.fill, box]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        maxFontSizeMultiplier={textScale.fixed}
        numberOfLines={1}
        style={[styles.initials, { fontSize: spec.fontSize, letterSpacing: spec.letterSpacing, color: ink }]}
      >
        {profile.initials}
      </Text>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    base: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    fill: { backgroundColor: color.surface3, borderWidth: 1, borderColor: color.border },
    outline: { borderWidth: 1.8 },
    dashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.border },
    initials: { fontFamily: font.monoBold, includeFontPadding: false },
  }),
);
