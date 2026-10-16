import React from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native';
import { haptics } from '@/utils/haptics';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { SPEEDS } from '@/utils/playback';

interface SpeedSelectorProps {
  selectedSpeed: number;
  onSelect: (speed: number) => void;
  style?: ViewStyle;
  /** Extra control rendered at the end of the row (the align-faces toggle). */
  trailing?: React.ReactNode;
}


function SpeedSelector({ selectedSpeed, onSelect, style, trailing }: SpeedSelectorProps) {
  const { fonts } = useFont();
  return (
    <View style={[styles.row, style]}>
      {SPEEDS.map((value) => {
        const label = `${value}x`;
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
    // Six speeds + the align toggle: spread across the width instead of fixed gaps.
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  item: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
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
