import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { computeFaceTransform, type Size } from '@/utils/faceAlign';
import { cachePolicyFor, getImageSource } from '@/utils/imageSource';
import { Colors } from '@/constants/theme';
import type { PhotoEntry } from '@/types';

interface ComparePaneProps {
  photo: PhotoEntry;
  /** Eye distance (px) for this pane size, shared by both panes so faces match in size. */
  targetEyeDist: (size: Size) => number | null;
}

/** One side of the comparison: the photo eye-aligned like a timelapse frame. */
export default function ComparePane({ photo, targetEyeDist }: ComparePaneProps) {
  const [size, setSize] = useState<Size | null>(null);
  const target = size ? targetEyeDist(size) : null;
  const layout = size && target && photo.faceScan ? computeFaceTransform(photo.faceScan, size, target) : null;
  return (
    <View testID="compare-pane" style={styles.pane} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Image
        source={getImageSource(photo.imageUri)}
        cachePolicy={cachePolicyFor(photo.imageUri)}
        contentFit={layout ? 'fill' : 'cover'}
        style={layout
          ? { position: 'absolute', left: layout.left, top: layout.top, width: layout.width, height: layout.height, transformOrigin: layout.transformOrigin, transform: [{ rotate: `${layout.rotation}rad` }] }
          : StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, overflow: 'hidden', backgroundColor: Colors.bgCard },
});
