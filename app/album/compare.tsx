import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { usePhotos } from '@/hooks/usePhotos';
import { haptics } from '@/utils/haptics';
import { buildFaceTrend, compareDays } from '@/utils/faceTrend';
import { coverEyeDistance, medianEyeDistance, type Size } from '@/utils/faceAlign';
import ComparePane from '@/components/face/ComparePane';
import Scrubber from '@/components/timelapse/Scrubber';

const fmt = (pct: number | null) => (pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`);

export default function CompareScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const { fonts } = useFont();
  const { photos: all } = usePhotos(albumId);
  const photos = useMemo(() => all.filter((p) => p.faceScan?.eyes), [all]);
  const trend = useMemo(() => buildFaceTrend(all), [all]);
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.max(0, photos.length - 1));
  const scans = useMemo(() => photos.map((p) => p.faceScan), [photos]);
  const targetEyeDist = (size: Size) =>
    medianEyeDistance(scans, size) ?? (photos[0]?.faceScan ? coverEyeDistance(photos[0].faceScan, size) : null);

  if (photos.length < 2 || !trend) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={[styles.note, { fontFamily: fonts.regular }]}>not enough measured photos to compare yet</Text>
      </SafeAreaView>
    );
  }
  const pa = photos[Math.min(a, photos.length - 1)];
  const pb = photos[Math.min(b, photos.length - 1)];
  const change = compareDays(trend, pa, pb);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => { haptics.tap(); router.back(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <CaretLeft size={20} color={Colors.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { fontFamily: fonts.regular }]}>compare</Text>
        <View style={{ width: 20 }} />
      </View>
      <View style={styles.panes}>
        <ComparePane photo={pa} targetEyeDist={targetEyeDist} />
        <ComparePane photo={pb} targetEyeDist={targetEyeDist} />
      </View>
      <Text style={[styles.result, { fontFamily: fonts.regular }]}>
        {pb.date} vs {pa.date}: trend {fmt(change.trend)} · photos {fmt(change.photo)}
      </Text>
      <View style={styles.scrubbers}>
        <Scrubber currentIndex={a} total={photos.length} startDate={photos[0].date} endDate={photos[photos.length - 1].date} onSeek={setA} />
        <Scrubber currentIndex={b} total={photos.length} startDate={photos[0].date} endDate={photos[photos.length - 1].date} onSeek={setB} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgPage },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 28, paddingVertical: Spacing.lg },
  title: { fontFamily: Fonts.mono.regular, fontSize: 16, color: Colors.textPrimary },
  panes: { flex: 1, flexDirection: 'row', gap: 2, paddingHorizontal: 28 },
  result: { fontFamily: Fonts.mono.regular, fontSize: 12, color: Colors.textSecondary, textAlign: 'center', paddingVertical: Spacing.md },
  scrubbers: { paddingHorizontal: 28, paddingBottom: Spacing.xl, gap: Spacing.md },
  note: { fontFamily: Fonts.mono.regular, fontSize: 12, color: Colors.textTertiary, textAlign: 'center', marginTop: 120 },
});
