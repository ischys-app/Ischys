/** Bottom-sheet menu for the ⋯ on a routine card — Edit / Rename / Duplicate / Reorder / Delete. */
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, font, TAP_TARGET } from '../theme/tokens';
import { CopyIcon, DumbbellIcon, EditIcon, ReorderIcon, TrashIcon } from './icons';

type Props = {
  visible: boolean;
  routineName: string;
  initials?: string;
  subline?: string;
  /** Open the routine builder for this routine. Omitted → the row is hidden. */
  onEdit?: () => void;
  onRename: (newName: string) => void | Promise<void>;
  onDuplicate: () => void | Promise<void>;
  onReorder: () => void;
  onDelete: () => void | Promise<void>;
  onClose: () => void;
};

export function RoutineMenuSheet({
  visible,
  routineName,
  initials,
  subline,
  onEdit,
  onRename,
  onDuplicate,
  onReorder,
  onDelete,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftName, setDraftName] = useState(routineName);

  // Keep the rename draft in sync with whichever routine is being edited.
  useEffect(() => {
    if (visible) setDraftName(routineName);
  }, [visible, routineName]);

  // Reset the inline rename state when the sheet closes.
  useEffect(() => {
    if (!visible) setRenameOpen(false);
  }, [visible]);

  const handleRenameTap = () => {
    setDraftName(routineName);
    setRenameOpen(true);
  };

  const handleRenameSave = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === routineName) {
      setRenameOpen(false);
      onClose();
      return;
    }
    setRenameOpen(false);
    onClose();
    await onRename(trimmed);
  };

  const handleRenameCancel = () => {
    setRenameOpen(false);
  };

  const handleDeleteTap = () => {
    Alert.alert(
      'Delete routine',
      `Delete "${routineName}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onClose();
            void onDelete();
          },
        },
      ],
    );
  };

  const handleDuplicateTap = async () => {
    onClose();
    await onDuplicate();
  };

  const handleReorderTap = () => {
    onClose();
    onReorder();
  };

  const handleEditTap = () => {
    onClose();
    onEdit?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
          onPress={() => {}}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.identityStrip}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitials}>{initials ?? ''}</Text>
            </View>
            <View style={styles.identityCol}>
              <Text style={styles.identityName} numberOfLines={1} ellipsizeMode="tail">
                {routineName}
              </Text>
              {!!subline && <Text style={styles.identitySub}>{subline}</Text>}
            </View>
          </View>

          <View style={styles.rows}>
            {onEdit && (
              <MenuRow
                icon={<DumbbellIcon size={20} color={color.text2} strokeWidth={2} />}
                label="Edit exercises"
                onPress={handleEditTap}
                showDivider={false}
              />
            )}
            <MenuRow
              icon={<EditIcon size={20} color={color.text2} strokeWidth={2} />}
              label="Rename"
              onPress={handleRenameTap}
              showDivider={false}
            />
            <MenuRow
              icon={<CopyIcon size={20} color={color.text2} strokeWidth={2} />}
              label="Duplicate"
              onPress={handleDuplicateTap}
              showDivider={false}
            />
            <MenuRow
              icon={<ReorderIcon size={20} color={color.text2} strokeWidth={2} />}
              label="Reorder routines"
              onPress={handleReorderTap}
              showDivider
            />
            <MenuRow
              icon={<TrashIcon size={20} color={color.error} strokeWidth={2} />}
              label="Delete"
              labelColor={color.error}
              onPress={handleDeleteTap}
              showDivider={false}
            />
          </View>
        </Pressable>
      </Pressable>

      {/* Inline rename modal — kept self-contained inside the sheet. */}
      <Modal
        visible={renameOpen}
        transparent
        animationType="fade"
        onRequestClose={handleRenameCancel}
      >
        <Pressable style={styles.renameBackdrop} onPress={handleRenameCancel}>
          <Pressable style={styles.renameCard} onPress={() => {}}>
            <Text style={styles.renameTitle}>Rename routine</Text>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              selectTextOnFocus
              placeholder="Routine name"
              placeholderTextColor={color.text3}
              style={styles.renameInput}
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={handleRenameSave}
            />
            <View style={styles.renameActions}>
              <Pressable
                onPress={handleRenameCancel}
                style={({ pressed }) => [
                  styles.renameBtn,
                  styles.renameCancel,
                  pressed && styles.renameCancelPressed,
                ]}
              >
                <Text style={styles.renameCancelLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleRenameSave}
                style={({ pressed }) => [
                  styles.renameBtn,
                  styles.renameSave,
                  pressed && styles.renameSavePressed,
                ]}
              >
                <Text style={styles.renameSaveLabel}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  labelColor,
  onPress,
  showDivider,
}: {
  icon: React.ReactNode;
  label: string;
  labelColor?: string;
  onPress: () => void;
  showDivider: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={[styles.rowLabel, labelColor && { color: labelColor }]}>{label}</Text>
      </Pressable>
      {showDivider && <View style={styles.divider} />}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: color.surface1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: color.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.8,
    shadowRadius: 50,
    elevation: 20,
  },
  grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
  identityStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.hair,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontFamily: font.monoBold,
    fontSize: 13,
    fontWeight: '700',
    color: color.accent,
  },
  identityCol: { flex: 1, minWidth: 0 },
  identityName: {
    fontFamily: font.titleSemi,
    fontSize: 15,
    fontWeight: '600',
    color: color.text1,
  },
  identitySub: {
    fontFamily: font.monoRegular,
    fontSize: 11,
    color: color.text3,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  rows: { paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    height: 56,
    minHeight: TAP_TARGET,
    paddingHorizontal: 18,
  },
  rowPressed: { backgroundColor: color.surface2 },
  rowIcon: { width: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: {
    fontFamily: font.bodyMedium,
    fontSize: 15,
    color: color.text1,
    letterSpacing: -0.15,
  },
  divider: { height: 1, backgroundColor: color.hair, marginHorizontal: 14 },

  // Inline rename modal
  renameBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  renameCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: color.surface1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.border,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  renameTitle: {
    fontFamily: font.titleSemi,
    fontSize: 17,
    letterSpacing: -0.17,
    color: color.text1,
    marginBottom: 12,
  },
  renameInput: {
    height: 48,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
    paddingHorizontal: 14,
    color: color.text1,
    fontFamily: font.bodyMedium,
    fontSize: 15,
  },
  renameActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  renameBtn: {
    flex: 1,
    height: 46,
    minHeight: TAP_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameCancel: {
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface2,
  },
  renameCancelPressed: { borderColor: color.text3 },
  renameCancelLabel: {
    fontFamily: font.titleSemi,
    fontSize: 14.5,
    color: color.text1,
  },
  renameSave: {
    backgroundColor: color.accent,
  },
  renameSavePressed: { opacity: 0.9 },
  renameSaveLabel: {
    fontFamily: font.displayBold,
    fontSize: 15,
    letterSpacing: -0.15,
    color: color.accentFg,
  },
});
