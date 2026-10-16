import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { haptics } from '@/utils/haptics';
import { buildFaceTrend, comparableCount, faceHeadline, trendGeometry, MIN_COMPARABLE, type TrendPhoto } from '@/utils/faceTrend';
import type { FaceScanProgress } from '@/hooks/useFaceScanBackfill';

const CHART_HEIGHT = 120;

interface FaceTrendCardProps {
  photos: TrendPhoto[];
  progress: FaceScanProgress;
  onSelectDate: (date: string) => void;
  onCompare: () => void;
}

/** Face width over time: a smoothed trend over faint daily dots, with a one-line headline. */
export default function FaceTrendCard({ photos, progress, onSelectDate, onCompare }: FaceTrendCardProps) {
  const { fonts } = useFont();
  const [width, setWidth] = useState(0);
  const trend = useMemo(() => buildFaceTrend(photos), [photos]);
  const geometry = useMemo(() => (trend && width > 0 ? trendGeometry(trend, width, CHART_HEIGHT) : null), [trend, width]);
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
                {geometry.dots.map((d) => (
                  <Circle key={d.photoId} cx={d.x} cy={d.y} r={1.5} fill={Colors.textTertiary} />
                ))}
                <Path d={geometry.line} stroke={Colors.accent} strokeWidth={2} fill="none" />
              </Svg>
            ) : null}
          </Pressable>
        </>
      ) : !progress.scanning ? (
        <Text style={[styles.note, { fontFamily: fonts.regular }]}>
          needs {MIN_COMPARABLE} comparable photos ({comparableCount(photos)} so far)
        </Text>
      ) : null}
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
