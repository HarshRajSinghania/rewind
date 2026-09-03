import React, { useEffect, useState } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { ImageBroken } from 'phosphor-react-native';
import { Colors } from '@/constants/theme';

/**
 * expo-image with a broken-file fallback. Local photo files can be evicted or
 * go missing (failed copy, manual deletion); a bare Image renders blank in that
 * case. PhotoImage shows a placeholder tile + icon instead. Drop-in for Image:
 * it takes the same style/contentFit/source props and fills that box.
 */
export default function PhotoImage({ style, onError, source, recyclingKey, ...rest }: ImageProps) {
  const [failed, setFailed] = useState(false);

  // Reset the error state when the displayed photo changes (e.g. a recycled
  // Filmstrip row or a modal switching photos), so a prior failure doesn't stick.
  const srcKey =
    recyclingKey ??
    (source && typeof source === 'object' && 'uri' in source ? String((source as { uri?: string }).uri) : JSON.stringify(source));
  useEffect(() => {
    setFailed(false);
  }, [srcKey]);

  return (
    <View style={[styles.wrap, style as StyleProp<ViewStyle>]}>
      {failed ? (
        <View style={styles.fallback}>
          <ImageBroken size={18} color={Colors.textTertiary} weight="light" />
        </View>
      ) : (
        <Image
          {...rest}
          source={source}
          recyclingKey={recyclingKey}
          style={StyleSheet.absoluteFill}
          onError={(e) => {
            setFailed(true);
            onError?.(e);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  fallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
  },
});
