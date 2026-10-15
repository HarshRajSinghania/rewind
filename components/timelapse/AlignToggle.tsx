import { Pressable, StyleSheet } from 'react-native';
import { UserFocus } from 'phosphor-react-native';
import { haptics } from '@/utils/haptics';
import { Colors } from '@/constants/theme';

interface AlignToggleProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

/** Switches timelapse face alignment; sits at the end of the speed row. */
export default function AlignToggle({ enabled, onToggle }: AlignToggleProps) {
  return (
    <Pressable
      onPress={() => { haptics.tap(); onToggle(!enabled); }}
      hitSlop={8}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel="align faces"
    >
      <UserFocus
        size={18}
        color={enabled ? Colors.accent : Colors.textTertiary}
        weight={enabled ? 'regular' : 'light'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
});
