import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { CaretLeft, Camera, Play, GearSix, LockSimple } from 'phosphor-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import MonthPicker from '@/components/ui/MonthPicker';
import PinModal from '@/components/ui/PinModal';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { usePhotos } from '@/hooks/usePhotos';
import { trackingStartDate } from '@/utils/streak';
import { useStreak } from '@/hooks/useStreak';
import { useAppContext } from '@/context/AppContext';
import { useAlbumLock } from '@/hooks/useAlbumLock';
import { haptics } from '@/utils/haptics';
import { pickPhotosFromLibrary } from '@/utils/import';
import ImportSheet, { ImportSource } from '@/components/ui/ImportSheet';
import MonthHeader from '@/components/timeline/MonthHeader';
import CalendarStats from '@/components/timeline/CalendarStats';
import CalendarGrid from '@/components/timeline/CalendarGrid';
import PhotoModal from '@/components/timeline/PhotoModal';
import EmptyState from '@/components/ui/EmptyState';

export default function AlbumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { photos, getPhotosByMonth } = usePhotos(id);
  const { profile, albums, addPhoto, updatePhoto, deletePhoto, updateProfile, updateAlbum, deleteAlbum } = useAppContext();
  const album = albums.find(a => a.id === id);
  const { currentStreak, consistency } = useStreak(id, album?.createdAt);

  const { fonts, typography } = useFont();

  const { isAlbumLocked, unlockAlbum } = useAlbumLock();
  const locked = isAlbumLocked(id);
  const [showPinModal, setShowPinModal] = useState(false);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [importTargetDate, setImportTargetDate] = useState<string | null>(null);

  // Animated month picker expand/collapse
  const MONTH_PICKER_HEIGHT = 224;
  const monthPickerHeight = useSharedValue(0);
  const monthPickerOpacity = useSharedValue(0);

  function toggleMonthPicker() {
    const next = !showMonthPicker;
    setShowMonthPicker(next);
    const config = { duration: 280, easing: Easing.out(Easing.cubic) };
    monthPickerHeight.value = withTiming(next ? MONTH_PICKER_HEIGHT : 0, config);
    monthPickerOpacity.value = withTiming(next ? 1 : 0, { duration: next ? 280 : 150 });
  }

  const monthPickerAnimatedStyle = useAnimatedStyle(() => ({
    height: monthPickerHeight.value,
    opacity: monthPickerOpacity.value,
    overflow: 'hidden' as const,
  }));

  const monthPhotos = getPhotosByMonth(currentMonth.year, currentMonth.month);
  // A2: captured = distinct dates within [album start, today]
  const captured = new Set(monthPhotos.map(p => p.date)).size;
  const today = new Date();
  const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
  // The album's history starts at its earliest photo when imports predate its creation.
  // Split the string (not new Date(...)) so a UTC parse can't shift the day.
  const startDate = trackingStartDate(album?.createdAt, profile.joinDate, photos.map(p => p.date));
  const [startYear, startMonth, startDayOfMonth] = startDate.split('-').map(Number);
  const isCurrentMonth = currentMonth.year === today.getFullYear() && currentMonth.month === today.getMonth() + 1;
  const isPastMonth = currentMonth.year < today.getFullYear() || (currentMonth.year === today.getFullYear() && currentMonth.month < today.getMonth() + 1);
  const rawDaysPassed = isCurrentMonth ? today.getDate() : isPastMonth ? daysInMonth : 0;
  // A2: daysPassed starts from the later of (first-of-month, album start)
  const isStartMonth = startYear === currentMonth.year && startMonth === currentMonth.month;
  const startDay = isStartMonth ? startDayOfMonth : 1;
  const daysPassed = Math.max(0, rawDaysPassed - (startDay - 1));
  const missed = Math.max(0, daysPassed - captured);

  const now = new Date();

  function handlePrevMonth() {
    setCurrentMonth(prev => {
      const prevTotal = prev.year * 12 + prev.month;
      const minTotal = startYear * 12 + startMonth;
      if (prevTotal <= minTotal) return prev;
      if (prev.month === 1) return { year: prev.year - 1, month: 12 };
      return { year: prev.year, month: prev.month - 1 };
    });
  }

  function handleNextMonth() {
    setCurrentMonth(prev => {
      const prevTotal = prev.year * 12 + prev.month;
      const maxTotal = now.getFullYear() * 12 + (now.getMonth() + 1);
      if (prevTotal >= maxTotal) return prev;
      if (prev.month === 12) return { year: prev.year + 1, month: 1 };
      return { year: prev.year, month: prev.month + 1 };
    });
  }

  function handleDayPress(date: string) {
    const index = monthPhotos.findIndex(p => p.date === date);
    if (index >= 0) {
      setSelectedPhotoIndex(index);
      setModalVisible(true);
    }
  }

  function handleEmptyDayPress(date: string) {
    haptics.tap();
    setImportTargetDate(date);
    setShowImportSheet(true);
  }

  async function handleImportSource(source: ImportSource) {
    setShowImportSheet(false);
    if (source === 'camera-roll') {
      try {
        const picked = await pickPhotosFromLibrary();
        if (picked.length === 0) return;
        const { createPhotoEntry } = await import('@/utils/import');
        const entries = [];
        for (const p of picked) {
          try {
            entries.push(await createPhotoEntry(p.uri, p.date ?? importTargetDate ?? '', '', id));
          } catch { /* copy failure — skip this file */ }
        }
        if (entries.length > 0) {
          for (const entry of entries) addPhoto(entry);
          haptics.success();
        } else {
          haptics.error();
        }
      } catch {
        haptics.error();
      }
    } else if (source === 'backup') {
      // Redirect to album settings for full backup import
      router.push({ pathname: '/album/settings', params: { albumId: id } });
    }
    setImportTargetDate(null);
  }

  function handleRetake(albumId: string) {
    router.push({ pathname: '/(tabs)/camera', params: { albumId } });
  }

  const albumName = album?.name ?? id ?? 'album';

  if (locked) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Stack.Screen options={{ contentStyle: { backgroundColor: Colors.bgPage }, animation: 'slide_from_right' }} />
        <View style={styles.header}>
          <Pressable
            onPress={() => { haptics.tap(); router.canGoBack() ? router.back() : router.replace('/'); }}
            hitSlop={12}
            style={styles.backBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <CaretLeft size={20} color={Colors.textPrimary} weight="regular" />
          </Pressable>
          <Text style={[styles.title, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <LockSimple size={48} color={Colors.textTertiary} weight="light" />
          <Text style={[typography.body, { color: Colors.textTertiary }]}>this album is locked</Text>
          <Pressable
            style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 24, backgroundColor: Colors.accent }, pressed && { opacity: 0.85 }]}
            onPress={() => setShowPinModal(true)}
            accessibilityLabel="Unlock album"
            accessibilityRole="button"
          >
            <Text style={[typography.body, { color: Colors.bgPage, fontFamily: fonts.medium }]}>unlock</Text>
          </Pressable>
        </View>
        <PinModal
          visible={showPinModal}
          intent="unlock"
          onSuccess={() => { setShowPinModal(false); unlockAlbum(id); }}
          onCancel={() => { setShowPinModal(false); router.canGoBack() ? router.back() : router.replace('/'); }}
          onNoPinFound={() => {
            // PIN data gone — auto-clear the lock so the user is not permanently locked out
            updateAlbum(id, { isLocked: false });
            setShowPinModal(false);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ contentStyle: { backgroundColor: Colors.bgPage }, animation: 'slide_from_right' }} />
      <View style={styles.header}>
        <Pressable
          onPress={() => { haptics.tap(); router.canGoBack() ? router.back() : router.replace('/'); }}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <CaretLeft size={20} color={Colors.textPrimary} weight="regular" />
        </Pressable>
        <Text style={[styles.title, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
        <Pressable
          onPress={() => { haptics.tap(); router.push({ pathname: '/album/settings', params: { albumId: id } }); }}
          hitSlop={12}
          style={styles.headerBtn}
          accessibilityLabel="Album settings"
          accessibilityRole="button"
        >
          <GearSix size={20} color={Colors.textPrimary} weight="regular" />
        </Pressable>
      </View>

      {photos.length === 0 ? (
        <View style={{ flex: 1 }}>
          <EmptyState
            icon={<Camera size={40} color={Colors.textTertiary} weight="light" />}
            message="no photos yet"
            subtitle="capture your first photo to start your streak"
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Album stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { fontFamily: fonts.light }]}>{photos.length}</Text>
              <Text style={typography.small}>photos</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { fontFamily: fonts.light, color: Colors.streak }]}>{currentStreak}</Text>
              <Text style={typography.small}>day streak</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { fontFamily: fonts.light }]}>{consistency}%</Text>
              <Text style={typography.small}>consistency</Text>
            </View>
          </View>

          <MonthHeader
            year={currentMonth.year}
            month={currentMonth.month}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            onTitlePress={toggleMonthPicker}
            disableNext={currentMonth.year * 12 + currentMonth.month >= now.getFullYear() * 12 + (now.getMonth() + 1)}
            disablePrev={currentMonth.year * 12 + currentMonth.month <= startYear * 12 + startMonth}
          />
          <Animated.View style={monthPickerAnimatedStyle}>
            <MonthPicker
              year={currentMonth.year}
              month={currentMonth.month}
              onChange={(year, month) => setCurrentMonth({ year, month })}
              minYear={startYear}
              minMonth={startMonth}
              maxYear={now.getFullYear()}
              maxMonth={now.getMonth() + 1}
            />
          </Animated.View>
          <CalendarStats captured={captured} missed={missed} />
          <CalendarGrid
            year={currentMonth.year}
            month={currentMonth.month}
            photos={photos}
            joinDate={startDate}
            onDayPress={handleDayPress}
            onEmptyDayPress={handleEmptyDayPress}
          />
          {captured === 0 && (isPastMonth || isCurrentMonth) && (
            <Text style={[styles.emptyMonthHint, { fontFamily: fonts.regular }]}>
              tap any day to backfill a photo
            </Text>
          )}
        </ScrollView>
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {photos.length >= 2 && (
          <Pressable
            style={({ pressed }) => [styles.timelapseBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { haptics.tap(); router.push({ pathname: '/album/timelapse', params: { albumId: id } }); }}
            accessibilityLabel="Play timelapse"
            accessibilityRole="button"
          >
            <Play size={14} color={Colors.textSecondary} weight="fill" />
            <Text style={[styles.timelapseBtnText, { fontFamily: fonts.regular }]}>timelapse</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.captureBtn, pressed && { opacity: 0.85 }]}
          onPress={() => { haptics.tap(); router.push({ pathname: '/(tabs)/camera', params: { albumId: id } }); }}
          accessibilityLabel="Take photo"
          accessibilityRole="button"
        >
          <Camera size={18} color={Colors.bgPage} weight="regular" />
          <Text style={[styles.captureBtnText, { fontFamily: fonts.medium }]}>capture</Text>
        </Pressable>
      </View>

      <PhotoModal
        visible={modalVisible}
        photos={monthPhotos}
        initialIndex={selectedPhotoIndex}
        joinDate={startDate}
        onClose={() => setModalVisible(false)}
        onDelete={(id) => { deletePhoto(id); if (monthPhotos.length <= 1) setModalVisible(false); }}
        onUpdateCaption={(id, caption) => updatePhoto(id, { caption })}
        onRetake={handleRetake}
      />

      <ImportSheet
        visible={showImportSheet}
        onSelect={handleImportSource}
        onClose={() => { setShowImportSheet(false); setImportTargetDate(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPage,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.mono.regular,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  content: {
    paddingHorizontal: 28,
    gap: 24,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontFamily: Fonts.mono.light,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -1,
    color: Colors.textPrimary,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 28,
    paddingTop: 12,
    backgroundColor: Colors.bgPage,
  },
  timelapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  timelapseBtnText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 11,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  captureBtnText: {
    fontFamily: Fonts.mono.medium,
    fontSize: 12,
    color: Colors.bgPage,
    letterSpacing: 1,
  },
  emptyMonthHint: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: -8,
  },
});
