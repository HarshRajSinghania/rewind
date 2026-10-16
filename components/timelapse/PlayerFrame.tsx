import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ImageStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { getImageSource, cachePolicyFor } from '@/utils/imageSource';
import type { PhotoEntry } from '@/types';

export interface FrameLayout {
  style: StyleProp<ImageStyle>;
  contentFit: 'cover' | 'fill';
}

interface PlayerFrameProps {
  photo: PhotoEntry;
  frameIndex: number;
  /** Frame on screen, driven on the UI thread. */
  shown: SharedValue<number>;
  layout: FrameLayout;
  onLoaded: (photoId: string) => void;
  onUnmount: (photoId: string) => void;
}

/** One mounted timelapse frame: decoded ahead of time, visible only when it's the shown frame. */
export default function PlayerFrame({ photo, frameIndex, shown, layout, onLoaded, onUnmount }: PlayerFrameProps) {
  const visibility = useAnimatedStyle(() => ({ opacity: shown.value === frameIndex ? 1 : 0 }));
  // A remounted view must decode again, so its "loaded" mark is dropped on unmount.
  useEffect(() => () => onUnmount(photo.id), [photo.id, onUnmount]);
  const loaded = () => onLoaded(photo.id);
  return (
    <Animated.View testID={`frame:${photo.imageUri}`} style={[StyleSheet.absoluteFill, visibility]} pointerEvents="none">
      <Image
        source={getImageSource(photo.imageUri)}
        style={layout.style}
        contentFit={layout.contentFit}
        cachePolicy={cachePolicyFor(photo.imageUri)}
        transition={0}
        // An error counts as loaded so one broken file can't freeze playback.
        onLoad={loaded}
        onError={loaded}
      />
    </Animated.View>
  );
}
