/**
 * Exercise avatar: the seeded catalog image when we have one, initials otherwise.
 *
 * Images are served by the user's own backend at /media, and only exist once the
 * admin has run `python -m app.cli fetch-images`. A miss is therefore ordinary,
 * not exceptional: on error we fall back to initials rather than a broken tile.
 */
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { color, font } from '../theme/tokens';

type Props = {
  imageUrl?: string | null;
  initials: string;
  size?: number;
  radius?: number;
  style?: ViewStyle;
};

export function ExerciseAvatar({ imageUrl, initials, size = 44, radius = 11, style }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageUrl) && !failed;

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

const styles = StyleSheet.create({
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
});
