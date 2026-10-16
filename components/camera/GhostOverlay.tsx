import React from 'react';
import { View, Text, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { Stack } from 'phosphor-react-native';
import Slider from '@/components/ui/OpacitySlider';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { cachePolicyFor } from '@/utils/imageSource';
import type { GhostPlacement } from '@/utils/ghost';

interface GhostOverlayProps {
  imageUri: string;
  opacity: number;
  onOpacityChange: (value: number) => void;
  /** Eye-anchored placement; null shows the photo as a plain cover fit. */
  placement: GhostPlacement | null;
  /** Mirror the photo: it was saved with the other mirroring than the preview shows. */
  flip: boolean;
}

/**
 * The last photo, faint over the viewfinder, with its eyes where yours should go.
 * It stays put (it doesn't follow your face), so lining up with it frames the shot.
 */
export default function GhostOverlay({ imageUri, opacity, onOpacityChange, placement, flip }: GhostOverlayProps) {
  const { fonts } = useFont();
  const layout = placement?.layout;
  const imageStyle: StyleProp<ImageStyle> = layout
    ? {
        position: 'absolute',
        left: layout.left,
        top: layout.top,
        width: layout.width,
        height: layout.height,
        transformOrigin: layout.transformOrigin,
        transform: [{ rotate: `${layout.rotation}rad` }],
      }
    : StyleSheet.absoluteFill;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The eyes sit on the vertical center line, so mirroring the whole frame keeps them in place. */}
      <View testID="ghost" style={[StyleSheet.absoluteFill, flip && styles.flipped]} pointerEvents="none">
        <Image
          source={{ uri: imageUri }}
          style={[imageStyle, { opacity }]}
          contentFit={layout ? 'fill' : 'cover'}
          cachePolicy={cachePolicyFor(imageUri)}
        />
      </View>
      <View style={styles.controls} pointerEvents="box-none">
        <View style={styles.badge}>
          <Stack size={12} color={Colors.textPrimary} weight="light" />
          <Text style={[styles.badgeText, { fontFamily: fonts.regular }]}>{Math.round(opacity * 100)}%</Text>
        </View>
        <View style={styles.sliderWrap}>
          <Slider value={opacity} onValueChange={onOpacityChange} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flipped: {
    transform: [{ scaleX: -1 }],
  },
  controls: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.bgPageTranslucent,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    color: Colors.textPrimary,
  },
  sliderWrap: {
    flex: 1,
    maxWidth: 120,
  },
});
