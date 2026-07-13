/**
 * Exercise Detail — About tab · Demo slot.
 * Source of truth: export/ischys-app/Exercise Detail Demo.dc.html.
 *
 * Two states:
 *  · EMPTY     — 190dp dashed tile + "Paste URL" / "Upload file" chips.
 *  · POPULATED — 190dp media area (video / thumbnail / image) + "Source ·
 *                <host>" footer with a small "Change" ghost button.
 *
 * URL persistence is fully on-device: the exercises row (`patchExercise`) plus a
 * SecureStore mirror the UI reads on launch. Nothing leaves the phone, so this
 * component validates the URL itself — only http(s) links, which the video
 * player can actually load — in place of the server check that used to do it.
 *
 * With no user demo set, we fall back to the seeded catalog image when the
 * exercise has one. Those come from free-exercise-db (public domain); the
 * on-device catalog ships no image paths today, so this is a hook for locally
 * bundled media later.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { VideoView, useVideoPlayer } from 'expo-video';

import { patchExercise } from '../api/workouts';
import { getDemoUrl, setDemoUrl } from '../lib/exerciseDemoStore';
import { color, font } from '../theme/tokens';

/** A demo URL the video player can load. Http(s) only — no server validates it now. */
const isHttpUrl = (u: string) => /^https?:\/\//i.test(u);

type Props = {
  /** Seeded catalog image, shown when the user has set no demo of their own. */
  fallbackImageUrl?: string | null;
  /** CC-BY-SA attribution for `fallbackImageUrl`. */
  imageAuthor?: string | null;
  exerciseId: string;
  /** Server-provided demo URL, if any. Falls back to SecureStore. */
  initialUrl: string | null;
};

// ---------------------------------------------------------------------------
// URL kind detection
// ---------------------------------------------------------------------------

type UrlKind = 'video' | 'embed' | 'image';

function classify(url: string): UrlKind {
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|webm)(\?|#|$)/.test(lower)) return 'video';
  if (lower.includes('youtube') || lower.includes('youtu.be') || lower.includes('vimeo')) {
    return 'embed';
  }
  return 'image';
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DemoSlot({ exerciseId, initialUrl, fallbackImageUrl, imageAuthor }: Props) {
  const [url, setUrl] = useState<string | null>(initialUrl && initialUrl.length ? initialUrl : null);
  const [editorOpen, setEditorOpen] = useState(false);

  // Rehydrate from SecureStore when no URL came from the server.
  useEffect(() => {
    let cancelled = false;
    if (initialUrl && initialUrl.length) {
      setUrl(initialUrl);
      return;
    }
    (async () => {
      const local = await getDemoUrl(exerciseId);
      if (!cancelled && local) setUrl(local);
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId, initialUrl]);

  const saveUrl = async (next: string) => {
    const clean = next.trim();
    // No server validates the URL anymore; guard here before it reaches the
    // video player. Empty clears the demo.
    if (clean.length && !isHttpUrl(clean)) return;
    const value = clean.length ? clean : null;
    setUrl(value);
    setEditorOpen(false);
    try {
      await setDemoUrl(exerciseId, value);
      await patchExercise(exerciseId, { demo_url: value });
    } catch (e) {
      console.warn('DemoSlot: failed to persist demo url', e);
    }
  };

  return (
    <View style={styles.card}>
      {url ? (
        <PopulatedTile url={url} onChange={() => setEditorOpen(true)} />
      ) : (
        <EmptyTile
          onPasteUrl={() => setEditorOpen(true)}
          fallbackImageUrl={fallbackImageUrl}
          imageAuthor={imageAuthor}
        />
      )}
      <UrlEditorModal
        visible={editorOpen}
        initial={url ?? ''}
        onCancel={() => setEditorOpen(false)}
        onSave={saveUrl}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyTile({
  onPasteUrl,
  fallbackImageUrl,
  imageAuthor,
}: {
  onPasteUrl: () => void;
  fallbackImageUrl?: string | null;
  imageAuthor?: string | null;
}) {
  const onUpload = () =>
    Alert.alert('Coming soon', 'Local upload will be added when we ship media hosting.');

  if (fallbackImageUrl) {
    return (
      <>
        <View style={styles.tileImage}>
          <Image
            source={{ uri: fallbackImageUrl }}
            style={styles.catalogImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>
        {imageAuthor ? <Text style={styles.attribution}>{`Image · ${imageAuthor}`}</Text> : null}
        <Pressable onPress={onPasteUrl} hitSlop={6}>
          <Text style={styles.addDemoLink}>Add a demo video →</Text>
        </Pressable>
      </>
    );
  }

  return (
    <>
      <View style={styles.tileDashed}>
        <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 5h16v14H4zM4 9h16M9 5v4"
            stroke={color.text3}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M12 13v4M10 15h4"
            stroke={color.text3}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={styles.addDemoLabel}>ADD DEMO</Text>
      </View>
      <View style={styles.chipRow}>
        <Pressable style={styles.chipBtn} onPress={onPasteUrl} accessibilityRole="button">
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"
              stroke={color.text1}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.chipText}>Paste URL</Text>
        </Pressable>
        <Pressable style={styles.chipBtn} onPress={onUpload} accessibilityRole="button">
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 16V4M8 8l4-4 4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke={color.text1}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.chipText}>Upload file</Text>
        </Pressable>
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
// Populated state
// ---------------------------------------------------------------------------

function PopulatedTile({ url, onChange }: { url: string; onChange: () => void }) {
  const kind = useMemo(() => classify(url), [url]);
  const host = useMemo(() => safeHost(url), [url]);
  return (
    <>
      <View style={styles.tileMedia}>
        {kind === 'video' ? (
          <VideoTile url={url} />
        ) : kind === 'embed' ? (
          <EmbedTile url={url} />
        ) : (
          <Image source={{ uri: url }} style={styles.mediaFill} resizeMode="cover" />
        )}
      </View>
      <View style={styles.footerRow}>
        <View style={styles.sourceCol}>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Path
              d="M4 5h16v14H4zM4 9h16M9 5v4"
              stroke={color.text3}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text style={styles.sourceText} numberOfLines={1}>
            Source · {host}
          </Text>
        </View>
        <Pressable onPress={onChange} hitSlop={8} accessibilityRole="button">
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
    </>
  );
}

/** Auto-play muted looping video via expo-video. */
function VideoTile({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.mediaFill}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/** YouTube / Vimeo etc — dark tile + big play glyph, taps open the system browser. */
function EmbedTile({ url }: { url: string }) {
  return (
    <Pressable
      style={[styles.mediaFill, styles.embedTile]}
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="button"
    >
      <View style={styles.playBadge}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d="M8 5v14l11-7z" fill={color.accentFg} />
        </Svg>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// URL editor modal
// ---------------------------------------------------------------------------

function UrlEditorModal({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  // Reset the field each time the modal is (re)opened.
  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  const hasValue = value.trim().length > 0;
  const invalid = hasValue && !isHttpUrl(value.trim());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Pressable
              onPress={onCancel}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={8}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M18 6L6 18M6 6l12 12"
                  stroke={color.text2}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Text style={styles.sheetTitle}>Demo URL</Text>
          </View>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="https://…/incline-db-press.mp4"
            placeholderTextColor={color.text3}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            selectionColor={color.accent}
            style={styles.input}
          />
          {invalid && <Text style={styles.inputError}>Enter an http(s) link to a video.</Text>}
          <View style={styles.sheetActions}>
            <Pressable
              onPress={() => onSave(value)}
              disabled={!hasValue || invalid}
              style={[
                styles.saveBtn,
                {
                  backgroundColor: hasValue && !invalid ? color.accent : color.surface2,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Save demo URL"
            >
              <Text
                style={[
                  styles.saveText,
                  { color: hasValue && !invalid ? color.accentFg : color.text3 },
                ]}
              >
                Save
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles — verbatim from Exercise Detail Demo.dc.html
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Card wrapper (both states share the outer chrome).
  card: {
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: 18,
    padding: 16,
  },

  // --- Empty state ---
  tileImage: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  catalogImage: { width: '100%', height: '100%' },
  attribution: {
    fontFamily: font.monoRegular,
    fontSize: 10,
    color: color.text3,
    marginTop: 8,
  },
  addDemoLink: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    color: color.text2,
    marginTop: 10,
  },
  tileDashed: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.border,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addDemoLabel: {
    fontFamily: font.monoRegular,
    fontSize: 12,
    letterSpacing: 1,
    color: color.text3,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chipBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  chipText: {
    fontFamily: font.titleSemi,
    fontSize: 13,
    color: color.text1,
  },

  // --- Populated state ---
  tileMedia: {
    width: '100%',
    height: 190,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: '#141419',
  },
  mediaFill: { width: '100%', height: '100%' },
  embedTile: {
    backgroundColor: '#141419',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,74,28,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: color.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  sourceCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  sourceText: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    flexShrink: 1,
  },
  changeText: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text2,
    textDecorationLine: 'underline',
  },

  // --- URL editor modal ---
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 16,
    padding: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sheetTitle: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    color: color.text1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    height: 46,
    paddingHorizontal: 13,
    backgroundColor: color.surface2,
    borderWidth: 1.5,
    borderColor: color.border,
    borderRadius: 10,
    color: color.text1,
    fontFamily: font.monoRegular,
    fontSize: 13,
  },
  inputError: {
    marginTop: 8,
    color: color.error,
    fontFamily: font.monoRegular,
    fontSize: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontFamily: font.titleSemi,
    fontSize: 14,
    fontWeight: '700',
  },
});
