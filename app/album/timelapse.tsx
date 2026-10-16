import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { useAppContext } from '@/context/AppContext';
import { usePhotos } from '@/hooks/usePhotos';
import { useTimelapse } from '@/hooks/useTimelapse';
import { haptics } from '@/utils/haptics';
import TimelapseView, { TimelapseEmpty } from '@/components/timelapse/TimelapseView';
import DateRangeSheet from '@/components/timelapse/DateRangeSheet';

export default function AlbumTimelapseScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const router = useRouter();
  const { albums } = useAppContext();
  const album = albums.find(a => a.id === albumId);
  const albumName = album?.name ?? albumId ?? 'album';

  const { fonts } = useFont();
  // Insets from the provider, known from the first frame. The native SafeAreaView only got
  // them after the slide-in animation, so the header and player jumped ~40dp once on open.
  const insets = useSafeAreaInsets();
  const safe = { paddingTop: insets.top, paddingBottom: insets.bottom };
  const { photos } = usePhotos(albumId);
  const timelapse = useTimelapse({ photos });

  function goBack() {
    haptics.tap();
    router.canGoBack() ? router.back() : router.replace('/');
  }

  if (timelapse.filteredPhotos.length < 2) {
    const message = timelapse.hasDateFilter
      ? 'No photos in this date range — try a wider range'
      : 'Take more photos to create your timelapse';
    return (
      <View testID="timelapse-screen-root" style={[styles.safeArea, safe]}>
        <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <CaretLeft size={20} color={Colors.textPrimary} weight="regular" />
          </Pressable>
          <Text style={[styles.headerTitle, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
          <View style={styles.headerRight} />
        </View>
        <TimelapseEmpty
          message={message}
          hasDateFilter={timelapse.hasDateFilter}
          onAdjustRange={() => timelapse.setShowDateRange(true)}
        />
        <DateRangeSheet
          visible={timelapse.showDateRange}
          dates={timelapse.allDates}
          startDate={timelapse.rangeStart}
          endDate={timelapse.rangeEnd}
          onApply={timelapse.handleDateRangeApply}
          onClose={() => timelapse.setShowDateRange(false)}
        />
      </View>
    );
  }

  const header = (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <CaretLeft size={20} color={Colors.textPrimary} weight="regular" />
        </Pressable>
        <Text style={[styles.headerTitle, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
        <View style={styles.headerRight} />
      </View>
    </>
  );

  return (
    <View testID="timelapse-screen-root" style={[styles.safeArea, safe]}>
      <TimelapseView header={header} timelapse={timelapse} speedSelectorStyle={{ paddingBottom: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: Fonts.mono.regular,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  headerRight: {
    width: 44,
  },
});
