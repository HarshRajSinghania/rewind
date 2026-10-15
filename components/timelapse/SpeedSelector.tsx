import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { haptics } from '@/utils/haptics';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';

interface SpeedSelectorProps {
  selectedSpeed: number;
  onSelect: (speed: number) => void;
  style?: ViewStyle;
  /** Extra control rendered at the end of the row (the align-faces toggle). */
  trailing?: React.ReactNode;
}

const SPEEDS = [
  { label: '0.5x', value: 0.5 },
  { label: '1x', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];

function SpeedSelector({ selectedSpeed, onSelect, style, trailing }: SpeedSelectorProps) {
  const { fonts } = useFont();
  return (
    <View style={[styles.row, style]}>
      {SPEEDS.map(({ label, value }) => {
        const isActive = selectedSpeed === value;
        return (
          <Pressable
            key={value}
            onPress={() => { haptics.tap(); onSelect(value); }}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.label, isActive ? styles.activeLabel : styles.inactiveLabel, { fontFamily: isActive ? fonts.medium : fonts.regular }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
      {trailing}
    </View>
  );
}

export default React.memo(SpeedSelector);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
  },
  item: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  label: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
  },
  activeLabel: {
    color: Colors.textPrimary,
    fontFamily: Fonts.mono.medium,
  },
  inactiveLabel: {
    color: Colors.textTertiary,
  },
});
