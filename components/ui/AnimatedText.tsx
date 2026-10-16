import { TextInput, StyleSheet, type StyleProp, type TextStyle, type TextInputProps } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue, type DerivedValue } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

interface AnimatedTextProps {
  text: SharedValue<string> | DerivedValue<string>;
  /** Shown until the UI thread first sets `text` (avoids reading a shared value in render). */
  initial: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Text whose content is set on the UI thread, so it can follow a per-frame value
 * (timelapse counter, date) without a React render each time.
 */
export default function AnimatedText({ text, initial, style, testID }: AnimatedTextProps) {
  const animatedProps = useAnimatedProps(() => ({ text: text.value }) as unknown as TextInputProps);
  return (
    <AnimatedTextInput
      testID={testID}
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={initial}
      style={[styles.reset, style]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  reset: {
    padding: 0,
    margin: 0,
  },
});
