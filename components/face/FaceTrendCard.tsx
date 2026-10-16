import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { haptics } from '@/utils/haptics';
import { comparableCount, faceHeadline, trendGeometry, MIN_COMPARABLE, type FaceTrend, type TrendPhoto } from '@/utils/faceTrend';
import type { FaceScanProgress } from '@/hooks/useFaceScanBackfill';

const CHART_HEIGHT = 120;

interface FaceTrendCardProps {
  photos: TrendPhoto[];
  /** The album's trend (built once by the screen, which also feeds the photo readout). */
  trend: FaceTrend | null;
  /** Photos are still waiting to be measured (e.g. while the q95 pass runs first). */
  waiting: boolean;
  progress: FaceScanProgress;
  onSelectDate: (date: string) => void;
  onCompare: () => void;
}

/** Face width over time: a smoothed trend over faint daily dots, with a one-line headline. */
export default function FaceTrendCard({ photos, trend, waiting, progress, onSelectDate, onCompare }: FaceTrendCardProps) {
  const { fonts } = useFont();
  const [width, setWidth] = useState(0);
  const geometry = useMemo(() => (trend && width > 0 ? trendGeometry(trend, width, CHART_HEIGHT) : null), [trend, width]);
  // One path of zero-length round-capped segments: a dot per photo without a node per photo.
  const dotsPath = useMemo(
    () => (geometry ? geometry.dots.map((d) => `M${d.x.toFixed(1)},${d.y.toFixed(1)}h0.01`).join('') : ''),
    [geometry],
  );
  const headline = trend ? faceHeadline(trend) : null;

  const handlePress = (e: GestureResponderEvent) => {
    if (!geometry || geometry.dots.length === 0) return;
    const x = e.nativeEvent.locationX;
    let best = geometry.dots[0];
    for (const d of geometry.dots) if (Math.abs(d.x - x) < Math.abs(best.x - x)) best = d;
    haptics.tap();
    onSelectDate(best.date);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={[styles.label, { fontFamily: fonts.regular }]}>face width</Text>
        {trend ? (
          <Pressable onPress={() => { haptics.tap(); onCompare(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Compare two days">
            <Text style={[styles.link, { fontFamily: fonts.regular }]}>compare</Text>
          </Pressable>
        ) : null}
      </View>
      {progress.scanning ? (
        <Text style={[styles.note, { fontFamily: fonts.regular }]}>measuring {progress.done}/{progress.total}</Text>
      ) : null}
      {trend ? (
        <>
          {headline ? <Text style={[styles.headline, { fontFamily: fonts.regular }]}>{headline}</Text> : null}
          <Pressable
            testID="face-chart"
            style={styles.chart}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onPress={handlePress}
            accessibilityLabel="Face width chart. Tap a day to open its photo."
          >
            {geometry ? (
              <Svg width={width} height={CHART_HEIGHT}>
                <Line x1={0} x2={width} y1={CHART_HEIGHT / 2} y2={CHART_HEIGHT / 2} stroke={Colors.borderDivider} strokeWidth={1} />
                <Path testID="face-chart-dots" d={dotsPath} stroke={Colors.textTertiary} strokeWidth={3} strokeLinecap="round" fill="none" />
                <Path d={geometry.line} stroke={Colors.accent} strokeWidth={2} fill="none" />
              </Svg>
            ) : null}
          </Pressable>
        </>
      ) : progress.scanning ? null : waiting ? (
        <Text style={[styles.note, { fontFamily: fonts.regular }]}>measuring soon</Text>
      ) : (
        <Text style={[styles.note, { fontFamily: fonts.regular }]}>
          needs {MIN_COMPARABLE} comparable photos ({comparableCount(photos)} so far)
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, padding: Spacing.lg, gap: Spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontFamily: Fonts.mono.regular, fontSize: 10, letterSpacing: 2, color: Colors.textSecondary, textTransform: 'uppercase' },
  link: { fontFamily: Fonts.mono.regular, fontSize: 12, color: Colors.accent },
  headline: { fontFamily: Fonts.mono.regular, fontSize: 14, color: Colors.textPrimary },
  note: { fontFamily: Fonts.mono.regular, fontSize: 12, color: Colors.textTertiary },
  chart: { height: CHART_HEIGHT },
});
