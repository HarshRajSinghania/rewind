import React, { useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { Colors } from '@/constants/theme';
import { buildFaceTrend, trendAt, type TrendPhoto } from '@/utils/faceTrend';

const HEIGHT = 24;
const DOT = 6;
/** Frames further apart than this are a gap: the line breaks there. */
const GAP_DAYS = 30;
/** The graph spans at least ±2% of the median, so day-to-day wobble stays small. */
const MIN_SPAN = 0.04;

interface FaceGraphProps {
  /** All album photos: the trend is fitted on these. */
  trendPhotos: TrendPhoto[];
  /** The frames being played (date-range filtered): the x-axis. */
  framePhotos: TrendPhoto[];
  frame: SharedValue<number>;
}

/** Face width trend across the playing frames, with a dot on the frame on screen (UI thread). */
function FaceGraph({ trendPhotos, framePhotos, frame }: FaceGraphProps) {
  const [width, setWidth] = useState(0);
  const values = useMemo(() => {
    const t = buildFaceTrend(trendPhotos);
    return t ? framePhotos.map((p) => trendAt(t, p.date)) : [];
  }, [trendPhotos, framePhotos]);
  const days = useMemo(() => framePhotos.map((p) => Date.parse(`${p.date}T00:00:00Z`) / 86400000), [framePhotos]);
  // Stable while the timelapse re-renders around it (~10x/s while playing): the worklet below
  // captures xs/ys, and new arrays would restart its UI-thread mapper every time.
  const { xs, ys, path, drawable } = useMemo(() => {
    const known = values.filter((v): v is number => v !== null);
    const n = values.length;
    const sorted = [...known].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1] ?? 1;
    const span = Math.max(sorted[sorted.length - 1] - sorted[0], MIN_SPAN * median) || 1;
    const lo = (sorted[0] + sorted[sorted.length - 1]) / 2 - span / 2;
    const xs = values.map((_, i) => (n > 1 ? (i / (n - 1)) * width : 0));
    const ys = values.map((v) => (v === null ? -1 : HEIGHT - 2 - ((v - lo) / span) * (HEIGHT - 4)));
    let path = '';
    let open = false;
    values.forEach((v, i) => {
      if (v === null) { open = false; return; }
      const gap = i > 0 && days[i] - days[i - 1] > GAP_DAYS;
      path += `${open && !gap ? 'L' : 'M'}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
      open = true;
    });
    return { xs, ys, path, drawable: known.length >= 2 };
  }, [values, days, width]);

  const dotStyle = useAnimatedStyle(() => {
    const i = Math.min(Math.max(frame.value, 0), xs.length - 1);
    const y = ys[i] ?? -1;
    return {
      opacity: y < 0 ? 0 : 1,
      transform: [{ translateX: (xs[i] ?? 0) - DOT / 2 }, { translateY: y - DOT / 2 }],
    };
  });

  if (!drawable) return null;
  return (
    <View testID="face-graph" style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} pointerEvents="none">
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          <Path testID="face-graph-line" d={path} stroke={Colors.textTertiary} strokeWidth={1.5} fill="none" />
        </Svg>
      ) : null}
      <Animated.View testID="face-graph-dot" style={[styles.dot, dotStyle]} />
    </View>
  );
}

export default React.memo(FaceGraph);

const styles = StyleSheet.create({
  wrap: { height: HEIGHT },
  dot: { position: 'absolute', left: 0, top: 0, width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: Colors.accent },
});
