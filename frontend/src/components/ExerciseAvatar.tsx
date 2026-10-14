/**
 * Exercise avatar: the seeded catalog image when we have one, initials otherwise.
 *
 * A catalog image is optional — many exercises simply don't have one. A miss is
 * therefore ordinary, not exceptional: on error we fall back to initials rather
 * than a broken tile.
 */
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { exerciseArt } from '../lib/exerciseArt';
import { color, font, themed } from '../theme/tokens';
import { ExerciseArt } from './ExerciseArt';
import { useThemed } from '../theme/ThemeProvider';

type Props = {
  imageUrl?: string | null;
  initials: string;
  /** Catalog id — when we have line art for it, it stands in for the initials. */
  exerciseId?: string | null;
  size?: number;
  radius?: number;
  style?: ViewStyle;
};

export function ExerciseAvatar({
  imageUrl,
  initials,
  exerciseId,
  size = 44,
  radius = 11,
  style,
}: Props) {
  useThemed();
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;
  // Held on the first frame: these appear in scrolling lists, where a loop in
  // every row would be noise.
  const art = showImage ? null : exerciseArt(exerciseId);

  if (art) {
    return (
      <View
        style={[
          styles.base,
          { width: size, height: size, borderRadius: radius },
          styles.initialsBg,
          style,
        ]}
      >
        <ExerciseArt
          frames={art.frames}
          viewBox={art.viewBox}
          size={Math.round(size * 0.94)}
          tint={color.text1}
          animate={false}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius },
        !showImage && styles.initialsBg,
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri: imageUrl as string }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.3) }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: color.surface2,
    },
    initialsBg: { backgroundColor: color.surface3 },
    initials: {
      fontFamily: font.monoSemi,
      color: color.text2,
      letterSpacing: 0.5,
    },
  }),
);
