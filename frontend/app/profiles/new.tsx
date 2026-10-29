/**
 * Add profile (P4, #117): name, initials, the read-only Health & Watch rows,
 * and an optional copy of the current profile's routines. Adding creates the
 * profile, then switches to it; the switch dismisses this screen (app/_layout's
 * useDismissOnProfileSwitch). Unreachable while PROFILES_ENABLED is off.
 * Source of truth: design-handoff/design_handoff_profiles/Profiles.dc.html, P4.
 */
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { PressableScale } from '../../src/components/PressableScale';
import { ProfileAvatar } from '../../src/components/ProfileAvatar';
import { SectionLabel } from '../../src/components/SectionLabel';
import { countRoutines } from '../../src/data/routinesRepo';
import { listProfiles } from '../../src/data/profilesRepo';
import {
  copyRoutinesLabel,
  copyRoutinesSub,
  deriveInitials,
  duplicateProfileName,
  MAX_NAME,
  newProfileHealthFooter,
  normalizeInitials,
  ownerLabel,
  type ProfileRow,
} from '../../src/domain/profiles';
import { DEFAULT_NAME, useActiveProfile } from '../../src/lib/activeProfile';
import { createProfile } from '../../src/lib/createProfile';
import { haptics } from '../../src/lib/haptics';
import { healthCopy } from '../../src/lib/healthSyncPlatform';
import { switchProfile } from '../../src/lib/switchProfile';
import { textScale } from '../../src/theme/textScale';
import { color, font, themed } from '../../src/theme/tokens';
import { useThemed } from '../../src/theme/ThemeProvider';

const WATCH_NAME = Platform.OS === 'ios' ? 'Apple Watch' : 'Watch';

function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}

export default function NewProfileScreen() {
  useThemed();
  const insets = useSafeAreaInsets();
  const { profile: current } = useActiveProfile();
  const keyboardShown = useKeyboardShown();

  const [name, setName] = useState('');
  /** The initials as typed; null while they follow the name. */
  const [initialsTyped, setInitialsTyped] = useState<string | null>(null);
  const [focused, setFocused] = useState<'name' | 'initials' | null>(null);
  const [copy, setCopy] = useState(false);
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [routineCount, setRoutineCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let live = true;
    Promise.all([listProfiles(), countRoutines()])
      .then(([profiles, count]) => {
        if (!live) return;
        setRows(profiles);
        setRoutineCount(count);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const trimmed = name.trim();
  const derived = normalizeInitials(deriveInitials(trimmed));
  const initials = initialsTyped || derived;
  const duplicate = duplicateProfileName(trimmed, rows);
  const owner = rows.find((r) => r.isOwner);
  const ownerText = ownerLabel(owner?.name ?? DEFAULT_NAME, DEFAULT_NAME);
  const canAdd = trimmed !== '' && initials !== '' && !busy;

  const onAdd = async () => {
    if (!canAdd || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFailed(false);
    Keyboard.dismiss();
    try {
      const p = await createProfile({ name: trimmed, initials, copyRoutines: copy && routineCount > 0 });
      const result = await switchProfile(p.id);
      // 'ok': the switch dismisses this screen itself. Anything else (a workout
      // running in this profile) leaves the new profile in the list; go back.
      if (result !== 'ok') {
        haptics.warning();
        router.back();
      }
    } catch (e) {
      if (__DEV__) console.warn('[profiles] add failed', e);
      haptics.warning();
      busyRef.current = false;
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ gestureEnabled: trimmed === '' }} />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingTop: insets.top + 75, paddingHorizontal: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.avatarWrap}>
            <ProfileAvatar profile={{ initials: trimmed ? initials : '?' }} size={84} />
          </View>

          <View style={styles.fields}>
            <View style={styles.flexField}>
              <SectionLabel style={styles.fieldLabel}>NAME</SectionLabel>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={MAX_NAME}
                autoFocus
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused(null)}
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
                value={initialsTyped ?? derived}
                onChangeText={(t) => setInitialsTyped(normalizeInitials(t))}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => setFocused('initials')}
                onBlur={() => {
                  setFocused(null);
                  // Cleared: follow the name again.
                  if (initialsTyped === '') setInitialsTyped(null);
                }}
                accessibilityLabel="Initials"
                maxFontSizeMultiplier={textScale.fixed}
                style={[styles.input, styles.initialsInput, focused === 'initials' && styles.inputFocused]}
              />
            </View>
          </View>
          {duplicate ? (
            <Text style={styles.hint}>
              {`You already have a ${duplicate}. Change the initials to tell them apart.`}
            </Text>
          ) : null}

          <SectionLabel style={{ ...styles.sectionLabel, ...styles.sectionTop }}>HEALTH & WATCH</SectionLabel>
          <View style={styles.card}>
            <View style={[styles.row, styles.rowDivider]} accessible accessibilityLabel={`${healthCopy(Platform.OS).name}, off`}>
              <HeartOutline />
              <Text style={styles.rowLabel} numberOfLines={1}>
                {healthCopy(Platform.OS).name}
              </Text>
              <Text style={styles.rowValue}>Off</Text>
            </View>
            <View style={styles.row} accessible accessibilityLabel={`${WATCH_NAME}, off`}>
              <WatchGlyph />
              <Text style={styles.rowLabel} numberOfLines={1}>
                {WATCH_NAME}
              </Text>
              <Text style={styles.rowValue}>Off</Text>
            </View>
          </View>
          <Text style={styles.footer}>{newProfileHealthFooter(trimmed, ownerText, healthCopy(Platform.OS).name)}</Text>

          {routineCount > 0 ? (
            <>
              <SectionLabel style={styles.sectionLabel}>START WITH</SectionLabel>
              <View style={styles.card}>
                <Pressable
                  onPress={() => setCopy((v) => !v)}
                  style={styles.row}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: copy }}
                  accessibilityLabel={copyRoutinesLabel(current, DEFAULT_NAME)}
                  accessibilityHint={copyRoutinesSub(routineCount).toLowerCase()}
                >
                  <CopyGlyph />
                  <View style={styles.rowLabelCol}>
                    <Text style={styles.rowLabelText}>{copyRoutinesLabel(current, DEFAULT_NAME)}</Text>
                    <Text style={styles.rowSub}>{copyRoutinesSub(routineCount)}</Text>
                  </View>
                  <View style={[styles.toggleTrack, { backgroundColor: copy ? color.accent : color.surface3 }]}>
                    <View style={[styles.toggleKnob, { left: copy ? 21 : 3 }]} />
                  </View>
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={[styles.bottom, { paddingBottom: keyboardShown ? 16 : Math.max(insets.bottom, 16) }]}>
          {failed ? <Text style={styles.error}>Couldn't add the profile. Try again.</Text> : null}
          <PressableScale
            onPress={onAdd}
            disabled={!canAdd}
            style={[styles.addBtn, !canAdd && styles.addBtnOff]}
            accessibilityRole="button"
            accessibilityLabel="Add profile"
            accessibilityState={{ disabled: !canAdd, busy }}
          >
            <Text maxFontSizeMultiplier={textScale.control} style={[styles.addText, !canAdd && styles.addTextOff]}>
              Add profile
            </Text>
          </PressableScale>
        </View>
      </KeyboardAvoidingView>

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text maxFontSizeMultiplier={textScale.control} style={styles.cancelText}>
            Cancel
          </Text>
        </Pressable>
        <Text maxFontSizeMultiplier={textScale.control} style={styles.title} accessibilityRole="header">
          New profile
        </Text>
        <View style={styles.headerSpacer} />
      </View>
    </View>
  );
}

function HeartOutline() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.5C5.5 16 3 12.5 3 8.8 3 6 5.2 4 7.5 4c1.7 0 3.3 1 4.5 2.6C13.2 5 14.8 4 16.5 4 18.8 4 21 6 21 8.8c0 3.7-2.5 7.2-9 11.7z"
        stroke={color.text2}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function WatchGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={6} width={12} height={12} rx={3} stroke={color.text2} strokeWidth={2} />
      <Path
        d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3"
        stroke={color.text2}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CopyGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Rect x={8} y={8} width={12} height={12} rx={2} stroke={color.text2} strokeWidth={2} />
      <Path
        d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"
        stroke={color.text2}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
      justifyContent: 'space-between',
      backgroundColor: color.headerBg,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    cancel: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: 9,
      backgroundColor: color.surface2,
      justifyContent: 'center',
    },
    pressed: { opacity: 0.85 },
    cancelText: { fontFamily: font.titleSemi, fontSize: 13, color: color.text1 },
    title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
    headerSpacer: { width: 64 },

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
    hint: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text3,
      paddingHorizontal: 2,
      paddingTop: 8,
    },

    sectionTop: { marginTop: 24 },
    sectionLabel: { letterSpacing: 1.54, paddingHorizontal: 2, paddingBottom: 10 },
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
    rowDivider: { borderBottomWidth: 1, borderBottomColor: color.hair },
    rowLabel: { flex: 1, fontFamily: font.bodyMedium, fontSize: 14.5, color: color.text1 },
    rowValue: { fontFamily: font.monoRegular, fontSize: 12.5, color: color.text3 },
    rowLabelCol: { flex: 1, minWidth: 0 },
    rowLabelText: { fontFamily: font.bodyMedium, fontSize: 14.5, color: color.text1 },
    rowSub: { fontFamily: font.monoRegular, fontSize: 11, color: color.text3, marginTop: 2 },
    footer: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18.75,
      color: color.text3,
      paddingTop: 8,
      paddingHorizontal: 2,
      paddingBottom: 24,
    },

    toggleTrack: { width: 44, height: 26, borderRadius: 999, flexShrink: 0 },
    toggleKnob: {
      position: 'absolute',
      top: 3,
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
    },

    bottom: { paddingTop: 16, paddingHorizontal: 16, backgroundColor: color.bg },
    error: {
      fontFamily: font.bodyRegular,
      fontSize: 12.5,
      color: color.error,
      textAlign: 'center',
      paddingBottom: 10,
    },
    addBtn: {
      height: 52,
      borderRadius: 14,
      backgroundColor: color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnOff: { backgroundColor: color.surface2 },
    addText: { fontFamily: font.displayBold, fontSize: 15, color: color.accentFg },
    addTextOff: { color: color.text3 },
  }),
);
