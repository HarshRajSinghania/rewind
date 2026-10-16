import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { buildFaceTrend, trendAt, type TrendPhoto } from '@/utils/faceTrend';

const HEIGHT = 24;
const DOT = 6;

interface FaceGraphProps {
  /** All album photos: the trend is fitted on these. */
  trendPhotos: TrendPhoto[];
  /** The frames being played (date-range filtered): the x-axis. */
  framePhotos: TrendPhoto[];
  frame: SharedValue<number>;
}

/** Face width trend across the playing frames, with a dot on the frame on screen (UI thread). */
export default function FaceGraph({ trendPhotos, framePhotos, frame }: FaceGraphProps) {
  const [width, setWidth] = useState(0);
  const values = useMemo(() => {
    const t = buildFaceTrend(trendPhotos);
    return t ? framePhotos.map((p) => trendAt(t, p.date)) : [];
  }, [trendPhotos, framePhotos]);
  const known = values.filter((v): v is number => v !== null);

  const { xs, ys, path } = useMemo(() => {
    const n = values.length;
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    const span = hi - lo || 1;
    const xs = values.map((_, i) => (n > 1 ? (i / (n - 1)) * width : 0));
    const ys = values.map((v) => (v === null ? -1 : HEIGHT - 2 - ((v - lo) / span) * (HEIGHT - 4)));
    let path = '';
    let open = false;
    values.forEach((v, i) => {
      if (v === null) { open = false; return; }
      path += `${open ? 'L' : 'M'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
      open = true;
    });
    return { xs, ys, path };
  }, [values, known, width]);

  const dotStyle = useAnimatedStyle(() => {
    const i = Math.min(Math.max(frame.value, 0), xs.length - 1);
    const y = ys[i] ?? -1;
    return {
      opacity: y < 0 ? 0 : 1,
      transform: [{ translateX: (xs[i] ?? 0) - DOT / 2 }, { translateY: y - DOT / 2 }],
    };
  });

  if (known.length < 2) return null;
  return (
    <View testID="face-graph" style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none">
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Path d={path} stroke={Colors.textTertiary} strokeWidth={1.5} fill="none" />
        </Svg>
      ) : null}
      <Animated.View testID="face-graph-dot" style={[styles.dot, dotStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: HEIGHT },
  dot: { position: 'absolute', left: 0, top: 0, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: Colors.accent },
});
