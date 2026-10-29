/**
 * A profile's detail (P8, #117): rename it, change its initials, export it,
 * and delete it (P8b). The owner can be renamed but never deleted; a profile
 * with the running workout can't be deleted until it is finished. Unreachable
 * while PROFILES_ENABLED is off.
 * Source of truth: design-handoff/design_handoff_profiles/Profiles.dc.html, P8.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { DeleteProfileSheet } from '../../src/components/DeleteProfileSheet';
import { ChevronRightIcon, TrashIcon, UploadIcon } from '../../src/components/icons';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { SectionLabel } from '../../src/components/SectionLabel';
import { exportProfile, SharingUnavailable } from '../../src/data/exportRepo';
import { getProfile } from '../../src/data/profilesRepo';
import {
  deleteBlock,
  deriveInitials,
  MAX_NAME,
  normalizeInitials,
  type ProfileRow,
} from '../../src/domain/profiles';
import { useActiveProfile } from '../../src/lib/activeProfile';
import { updateProfileIdentity } from '../../src/lib/profileName';
import { runningWorkoutProfileId } from '../../src/lib/switchProfile';
import { textScale } from '../../src/theme/textScale';
import { color, font, themed } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

export default function ProfileDetailScreen() {
  useThemed();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile: active } = useActiveProfile();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [initials, setInitials] = useState('');
  const [focused, setFocused] = useState<'name' | 'initials' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const [row, runningId] = await Promise.all([getProfile(id), runningWorkoutProfileId().catch(() => null)]);
    setRunning(runningId);
    if (!row) {
      // Deleted meanwhile, or a stale link: nothing to show here.
      if (router.canGoBack()) router.back();
      else router.replace('/profiles');
      return;
    }
    setProfile(row);
    setName(row.name);
    setInitials(row.initials);
  }, [id]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const save = async (patch: { name?: string; initials?: string }) => {
    if (!profile) return;
    const next = { ...profile, ...patch };
    setProfile(next);
    try {
      await updateProfileIdentity(profile.id, patch);
    } catch (e) {
      if (__DEV__) console.warn('[profiles] rename failed', e);
      setProfile(profile);
      setName(profile.name);
      setInitials(profile.initials);
    }
  };

  const commitName = () => {
    setFocused(null);
    if (!profile) return;
    const v = name.trim();
    if (!v) {
      setName(profile.name);
      return;
    }
    if (v === profile.name) return;
    setName(v);
    // Initials that followed the old name follow the new one.
    if (profile.initials === normalizeInitials(deriveInitials(profile.name))) {
      const derived = normalizeInitials(deriveInitials(v));
      setInitials(derived);
      void save({ name: v, initials: derived });
    } else {
      void save({ name: v });
    }
  };

  const commitInitials = () => {
    setFocused(null);
    if (!profile) return;
    const v = normalizeInitials(initials) || normalizeInitials(deriveInitials(profile.name));
    setInitials(v);
    if (v && v !== profile.initials) void save({ initials: v });
  };

  const onExport = () => {
    if (!profile) return;
    const run = (fmt: 'json' | 'csv') =>
      exportProfile(fmt, profile.id).catch((e) => {
        Alert.alert(e instanceof SharingUnavailable ? 'Sharing unavailable' : 'Export failed');
      });
    Alert.alert('Export data', 'Choose a format', [
      { text: 'JSON', onPress: () => void run('json') },
      { text: 'CSV', onPress: () => void run('csv') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openDelete = async () => {
    // Re-check: a workout may have started since this screen loaded.
    const runningId = await runningWorkoutProfileId().catch(() => null);
    setRunning(runningId);
    if (profile && !deleteBlock({ profile, activeWorkoutProfileId: runningId })) setDeleting(true);
  };

  const onDeleted = () => {
    setDeleting(false);
    // Deleting the active profile switched to the owner, which dismissed this
    // stack already; otherwise go back to the list.
    if (profile && profile.id !== active.id && router.canGoBack()) router.back();
  };

  const block = profile ? deleteBlock({ profile, activeWorkoutProfileId: running }) : null;
  const shownInitials = normalizeInitials(initials) || profile?.initials || '?';

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingTop: 116 + insets.top, paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <ProfileAvatar profile={{ initials: shownInitials }} size={84} />
          </View>

          <View style={styles.fields}>
            <View style={styles.flexField}>
              <SectionLabel style={styles.fieldLabel}>NAME</SectionLabel>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={MAX_NAME}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => setFocused('name')}
                onBlur={commitName}
                placeholder="Name"
                placeholderTextColor={color.text3}
                accessibilityLabel="Name"
                maxFontSizeMultiplier={textScale.control}
                style={[styles.input, styles.nameInput, focused === 'name' && styles.inputFocused]}
              />
            </View>
            <View style={styles.initialsField}>
              <SectionLabel style={styles.fieldLabel}>INITIALS</SectionLabel>
              <TextInput
                value={initials}
                onChangeText={(t) => setInitials(normalizeInitials(t))}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => setFocused('initials')}
                onBlur={commitInitials}
                accessibilityLabel="Initials"
                maxFontSizeMultiplier={textScale.fixed}
                style={[styles.input, styles.initialsInput, focused === 'initials' && styles.inputFocused]}
              />
            </View>
          </View>

          <View style={[styles.card, styles.cardTop]}>
            <Pressable
              onPress={onExport}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Export this profile"
            >
              <UploadIcon size={20} color={color.text2} />
              <Text style={styles.rowLabel} numberOfLines={1}>
                Export this profile
              </Text>
              <Text style={styles.rowValue}>CSV · JSON</Text>
              <ChevronRightIcon size={15} color={color.text3} strokeWidth={2.2} />
            </Pressable>
          </View>

          {profile && block === null ? (
            <View style={[styles.card, styles.cardTop]}>
              <Pressable
                onPress={() => void openDelete()}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Delete profile"
              >
                <TrashIcon size={20} color={color.error} strokeWidth={2} />
                <Text style={[styles.rowLabel, styles.danger]} numberOfLines={1}>
                  Delete profile
                </Text>
              </Pressable>
            </View>
          ) : null}
          {block === 'owner' ? (
            <Text style={styles.note}>This is the phone owner's profile. It can't be deleted.</Text>
          ) : null}
          {block === 'workout' ? (
            <Text style={styles.note}>Finish the workout in progress to delete this profile.</Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.header, { paddingTop: 54 + insets.top }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Svg width={9} height={15} viewBox="0 0 9 15" fill="none">
            <Path d="M7 2L2 7.5 7 13" stroke={color.text2} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={textScale.control} accessibilityRole="header">
          {profile?.name ?? ''}
        </Text>
      </View>

      {profile ? (
        <DeleteProfileSheet
          visible={deleting}
          profile={profile}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
        />
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.bg },
    flex: { flex: 1 },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: color.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backBtn: {
      width: 34,
      height: 34,
      borderRadius: 9,
      backgroundColor: color.surface2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { flex: 1, fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
    pressed: { opacity: 0.7 },

    content: { paddingHorizontal: 16 },
    avatarWrap: { alignItems: 'center', marginBottom: 22 },
    fields: { flexDirection: 'row', gap: 10 },
    flexField: { flex: 1, minWidth: 0 },
    initialsField: { width: 92 },
    fieldLabel: { letterSpacing: 1.54, paddingHorizontal: 2, paddingBottom: 8 },
    input: {
      height: 52,
      borderRadius: 12,
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      paddingHorizontal: 14,
    },
    inputFocused: { borderWidth: 1.5, borderColor: color.text2 },
    nameInput: { fontFamily: font.bodyMedium, fontSize: 16, color: color.text1 },
    initialsInput: {
      fontFamily: font.monoSemi,
      fontSize: 16,
      color: color.text2,
      textAlign: 'center',
      paddingHorizontal: 6,
    },

    cardTop: { marginTop: 24 },
    card: {
      backgroundColor: color.surface1,
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: 16,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      paddingVertical: 15,
      paddingHorizontal: 16,
    },
    rowLabel: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14.5, color: color.text1 },
    danger: { color: color.error },
    rowValue: { fontFamily: font.monoRegular, fontSize: 12.5, color: color.text3 },
    note: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text3,
      paddingTop: 24,
      paddingHorizontal: 2,
    },
  }),
);
