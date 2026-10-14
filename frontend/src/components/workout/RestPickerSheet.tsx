/** Bottom sheet to pick an exercise's rest duration. */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DraggableSheet } from '../DraggableSheet';
import { accentA, color, font, themed } from '../../theme/tokens';
import { CheckIcon } from '../icons';
import { REST_OPTIONS } from './types';
import { useThemed } from '../../theme/ThemeProvider';

type Props = {
  visible: boolean;
  selectedSeconds: number;
  onSelect: (seconds: number) => void;
  onClose: () => void;
};

export function RestPickerSheet({ visible, selectedSeconds, onSelect, onClose }: Props) {
  useThemed();
  return (
    <DraggableSheet visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <View style={styles.grabberWrap}>
        <View style={styles.grabber} />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Rest Timer</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {REST_OPTIONS.map((opt) => {
          const selected = opt.seconds === selectedSeconds;
          return (
            <Pressable
              key={opt.seconds}
              onPress={() => onSelect(opt.seconds)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <Text
                style={[
                  styles.optionLabel,
                  selected
                    ? styles.optionLabelSelected
                    : opt.seconds === 0 && styles.optionLabelOff,
                ]}
              >
                {opt.label}
              </Text>
              {selected && <CheckIcon size={17} color={color.accent} strokeWidth={3} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </DraggableSheet>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    sheet: {
      backgroundColor: color.surface1,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderTopColor: color.border,
      maxHeight: '68%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -20 },
      shadowOpacity: 0.8,
      shadowRadius: 50,
      elevation: 20,
    },
    grabberWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 4 },
    grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.surface3 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      paddingHorizontal: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: color.hair,
    },
    title: { fontFamily: font.titleSemi, fontSize: 17, letterSpacing: -0.17, color: color.text1 },
    done: { fontFamily: font.titleSemi, fontSize: 15, color: color.accent },
    list: { flexGrow: 0 },
    listContent: { padding: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 48,
      paddingHorizontal: 14,
      borderRadius: 11,
    },
    optionSelected: { backgroundColor: accentA(0.12) },
    optionLabel: {
      fontFamily: font.monoMedium,
      fontSize: 16,
      color: color.text1,
      fontVariant: ['tabular-nums'],
    },
    optionLabelSelected: { fontFamily: font.monoSemi, color: color.accent },
    optionLabelOff: { color: color.text3 },
  }),
);
