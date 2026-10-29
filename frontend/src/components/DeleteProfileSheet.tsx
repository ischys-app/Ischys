/**
 * Delete confirm (P8b, #117). The one irreversible action in profiles: it
 * erases a person's whole history from this phone. The counts make the loss
 * concrete, and "Export first" runs the JSON export of the profile being
 * deleted, then returns here. Deleting the active profile switches to the
 * owner first (deleteProfile), which dismisses every screen above the tabs.
 * Source of truth: design-handoff/design_handoff_profiles/Profiles.dc.html, P8b.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { exportProfile, SharingUnavailable } from '../data/exportRepo';
import { profileCounts } from '../data/profilesRepo';
import { deleteSheetBody, firstName, possessive, type ProfileCounts, type ProfileRow } from '../domain/profiles';
import { deleteProfile } from '../lib/deleteProfile';
import { haptics } from '../lib/haptics';
import { textScale } from '../theme/textScale';
import { color, font, themed } from '../theme/tokens';
import { useThemed } from '../theme/ThemeProvider';
import { DraggableSheet } from './DraggableSheet';
import { UploadIcon } from './icons';
import { PressableScale } from './PressableScale';
import { ProfileAvatar } from './ProfileAvatar';

type Props = {
  visible: boolean;
  profile: ProfileRow;
  onClose: () => void;
  /** After the profile is gone. Not called when the delete was refused or failed. */
  onDeleted: () => void;
};

export function DeleteProfileSheet({ visible, profile, onClose, onDeleted }: Props) {
  useThemed();
  const [counts, setCounts] = useState<ProfileCounts | null>(null);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    setMessage(null);
    profileCounts(profile.id)
      .then((c) => live && setCounts(c))
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, [visible, profile.id]);

  const first = firstName(profile.name) || profile.name;

  const run = async (kind: 'export' | 'delete', fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setMessage(null);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const onExport = () =>
    run('export', async () => {
      try {
        await exportProfile('json', profile.id);
      } catch (e) {
        setMessage(e instanceof SharingUnavailable ? 'Sharing unavailable.' : "Couldn't export. Try again.");
      }
    });

  const onDelete = () =>
    run('delete', async () => {
      haptics.warning();
      try {
        await deleteProfile(profile.id);
      } catch (e) {
        if (__DEV__) console.warn('[profiles] delete failed', e);
        setMessage(`Couldn't delete ${first}. Try again.`);
        return;
      }
      onDeleted();
    });

  const body = counts ? deleteSheetBody(profile.name, counts) : null;

  return (
    <DraggableSheet visible={visible} onClose={busy ? () => {} : onClose} sheetStyle={styles.sheet}>
      <View style={styles.grabber} />
      <View style={styles.head}>
        <ProfileAvatar profile={profile} size={40} />
        <Text style={styles.title} maxFontSizeMultiplier={textScale.display} accessibilityRole="header">
          {`Delete ${profile.name}?`}
        </Text>
      </View>
      <Text style={styles.body}>
        {body
          ? body.map((part, i) =>
              part.count ? (
                <Text key={i} style={styles.count}>
                  {part.text}
                </Text>
              ) : (
                part.text
              ),
            )
          : `This erases ${possessive(profile.name)} data from this phone. Other profiles aren't affected. This can't be undone.`}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.buttons}>
        <PressableScale
          onPress={onExport}
          disabled={busy !== null}
          style={styles.exportBtn}
          accessibilityRole="button"
          accessibilityLabel={`Export ${possessive(profile.name)} data first`}
          accessibilityState={{ disabled: busy !== null, busy: busy === 'export' }}
        >
          {busy === 'export' ? (
            <ActivityIndicator color={color.text2} />
          ) : (
            <>
              <UploadIcon size={16} color={color.text1} strokeWidth={2.2} />
              <Text style={styles.exportText} maxFontSizeMultiplier={textScale.control} numberOfLines={1}>
                {`Export ${first}'s data first`}
              </Text>
            </>
          )}
        </PressableScale>
        <PressableScale
          onPress={onDelete}
          disabled={busy !== null}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${first}`}
          accessibilityState={{ disabled: busy !== null, busy: busy === 'delete' }}
        >
          {busy === 'delete' ? (
            <ActivityIndicator color={color.accentFg} />
          ) : (
            <Text style={styles.deleteText} maxFontSizeMultiplier={textScale.control} numberOfLines={1}>
              {`Delete ${first}`}
            </Text>
          )}
        </PressableScale>
        <Pressable
          onPress={onClose}
          disabled={busy !== null}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText} maxFontSizeMultiplier={textScale.control}>
            Cancel
          </Text>
        </Pressable>
      </View>
    </DraggableSheet>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderTopWidth: 1,
      borderColor: color.border,
      paddingTop: 10,
      paddingHorizontal: 20,
      paddingBottom: 34,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: color.surface3,
      marginBottom: 18,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: {
      flex: 1,
      fontFamily: font.displayBold,
      fontSize: 19,
      letterSpacing: -0.38,
      color: color.text1,
    },
    body: {
      fontFamily: font.bodyRegular,
      fontSize: 14,
      lineHeight: 21,
      color: color.text2,
      marginTop: 12,
    },
    count: { fontFamily: font.monoRegular, color: color.text1 },
    message: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      color: color.error,
      marginTop: 10,
    },
    buttons: { gap: 10, marginTop: 20 },
    exportBtn: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.surface2,
      borderWidth: 1,
      borderColor: color.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    exportText: { fontFamily: font.titleSemi, fontSize: 15, color: color.text1 },
    deleteBtn: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    deleteText: { fontFamily: font.displayBold, fontSize: 15, color: color.accentFg },
    cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.7 },
    cancelText: { fontFamily: font.titleSemi, fontSize: 15, color: color.text2 },
  }),
);
