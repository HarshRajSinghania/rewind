import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View, Alert, useWindowDimensions } from 'react-native';
import TextInputModal from '@/components/ui/TextInputModal';
import PinModal from '@/components/ui/PinModal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import PhotoImage from '@/components/ui/PhotoImage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Plus, CaretRight, Camera, GearSix, LockSimple, PencilSimple, Trash } from 'phosphor-react-native';
import { Colors, Fonts, Sizes } from '@/constants/theme';
import { useAppContext } from '@/context/AppContext';
import { useFont } from '@/context/FontContext';
import { usePhotos } from '@/hooks/usePhotos';
import { useStreak } from '@/hooks/useStreak';
import { useGreeting } from '@/hooks/useGreeting';
import { useAlbumLock } from '@/hooks/useAlbumLock';
import { haptics } from '@/utils/haptics';
import { getImageSource } from '@/utils/imageSource';
import { faceContentPosition } from '@/utils/faceAlign';
import { createAlbum } from '@/utils/albums';
import type { Album } from '@/types';

const CONTENT_PADDING = 28;
const HERO_HEIGHT = 300;
const THUMB_SIZE = 48;

// ─── HeroCard ───────────────────────────────────────────────────────────────

function HeroCard({
  albumId,
  albumName,
  albumCreatedAt,
  onUnlockRequest,
}: {
  albumId: string;
  albumName: string;
  albumCreatedAt: string;
  onUnlockRequest?: (albumId: string) => void;
}) {
  const router = useRouter();
  const { todayPhoto } = usePhotos(albumId);
  const { width: windowWidth } = useWindowDimensions();
  const { currentStreak, weekStatus } = useStreak(albumId, albumCreatedAt);
  const { fonts, typography } = useFont();
  const { isAlbumLocked } = useAlbumLock();
  const locked = isAlbumLocked(albumId);

  function handlePress() {
    haptics.tap();
    if (locked) {
      onUnlockRequest?.(albumId);
      return;
    }
    router.push({ pathname: '/album/[id]', params: { id: albumId } });
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.heroCard, pressed && { opacity: 0.8 }]}
      onPress={handlePress}
      accessibilityLabel={`${albumName} album`}
      accessibilityRole="button"
    >
      {locked ? (
        <View style={[StyleSheet.absoluteFill, styles.heroEmpty]}>
          <LockSimple size={36} color={Colors.textTertiary} weight="light" />
          <Text style={[styles.heroEmptyText, { fontFamily: fonts.regular }]}>locked</Text>
        </View>
      ) : todayPhoto ? (
        <PhotoImage
          source={getImageSource(todayPhoto.imageUri)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={faceContentPosition(todayPhoto.faceScan, { w: windowWidth - 2 * CONTENT_PADDING, h: HERO_HEIGHT })}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroEmpty]}>
          <Camera size={36} color={Colors.textTertiary} weight="light" />
          <Text style={[styles.heroEmptyText, { fontFamily: fonts.regular }]}>{"take today's photo"}</Text>
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={styles.heroGradient}
      />

      <View style={styles.heroOverlay}>
        <View style={styles.heroOverlayTop}>
          <View style={styles.heroOverlayLeft}>
            <Text style={[styles.heroAlbumName, { fontFamily: fonts.regular }]} numberOfLines={1}>{albumName}</Text>
            {!locked && (
              <Text style={[typography.small, { color: Colors.streak }]}>
                {currentStreak > 0 ? `${currentStreak} day streak` : 'no streak yet'}
              </Text>
            )}
          </View>
          <CaretRight size={16} color={Colors.textTertiary} weight="regular" />
        </View>
        {!locked && (
          <View style={styles.weekRow}>
            {weekStatus.map((wd) => (
              <View key={wd.date} style={styles.weekDayCol}>
                <View
                  accessibilityLabel={`${wd.date}: ${wd.status}`}
                  style={[
                    styles.weekDot,
                    (wd.status === 'captured' || wd.status === 'today-done') && styles.weekDotFilled,
                    wd.status === 'today-pending' && styles.weekDotToday,
                    (wd.status === 'disabled' || wd.status === 'upcoming') && styles.weekDotDim,
                  ]}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── AlbumRow ────────────────────────────────────────────────────────────────

function RightActions({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <View style={styles.actionsContainer}>
      <Pressable
        style={[styles.actionBtn, styles.actionRename]}
        onPress={onRename}
        accessibilityLabel="Rename album"
        accessibilityRole="button"
      >
        <PencilSimple size={18} color={Colors.textPrimary} weight="regular" />
        <Text style={[styles.actionLabel, { fontFamily: Fonts.mono.regular }]}>rename</Text>
      </Pressable>
      <Pressable
        style={[styles.actionBtn, styles.actionDelete]}
        onPress={onDelete}
        accessibilityLabel="Delete album"
        accessibilityRole="button"
      >
        <Trash size={18} color={Colors.textPrimary} weight="regular" />
        <Text style={[styles.actionLabel, { fontFamily: Fonts.mono.regular }]}>delete</Text>
      </Pressable>
    </View>
  );
}

function AlbumRow({ album, onUnlockRequest, onRenameRequest, onDeleteRequest }: {
  album: Album;
  onUnlockRequest?: (albumId: string) => void;
  onRenameRequest: (album: Album) => void;
  onDeleteRequest: (album: Album) => void;
}) {
  const router = useRouter();
  const { totalPhotos, mostRecentPhoto } = usePhotos(album.id);
  const { currentStreak } = useStreak(album.id, album.createdAt);
  const imageUri = mostRecentPhoto?.imageUri ?? null;
  const thumbPosition = faceContentPosition(mostRecentPhoto?.faceScan, { w: THUMB_SIZE, h: THUMB_SIZE });
  const { typography } = useFont();
  const { isAlbumLocked } = useAlbumLock();
  const locked = isAlbumLocked(album.id);
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  function handlePress() {
    haptics.tap();
    if (locked) {
      onUnlockRequest?.(album.id);
      return;
    }
    router.push({ pathname: '/album/[id]', params: { id: album.id } });
  }

  // Locked albums must be unlocked (PIN) before rename/delete — mirror handlePress
  // so the swipe actions can't bypass the lock gate.
  const renderRightActions = useCallback(
    () => (
      <RightActions
        onRename={() => { swipeableRef.current?.close(); if (locked) { onUnlockRequest?.(album.id); return; } onRenameRequest(album); }}
        onDelete={() => { swipeableRef.current?.close(); if (locked) { onUnlockRequest?.(album.id); return; } onDeleteRequest(album); }}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [album.id, locked],
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      rightThreshold={40}
    >
      <View style={styles.rowInner}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
          onPress={handlePress}
          accessibilityLabel={`${album.name} album`}
          accessibilityRole="button"
        >
          <View style={styles.thumbnail}>
            {locked ? (
              <View style={[styles.thumbnailPlaceholder, { alignItems: 'center', justifyContent: 'center' }]}>
                <LockSimple size={20} color={Colors.textTertiary} weight="light" />
              </View>
            ) : imageUri ? (
              <PhotoImage
                source={getImageSource(imageUri)}
                style={styles.thumbnailImage}
                contentFit="cover"
                contentPosition={thumbPosition}
              />
            ) : (
              <View style={styles.thumbnailPlaceholder} />
            )}
          </View>
          <View style={styles.rowInfo}>
            <Text style={typography.body} numberOfLines={1}>{album.name}</Text>
            <Text style={[typography.small, { color: Colors.textTertiary }]}>
              {locked ? 'locked' : currentStreak > 0 ? `${currentStreak} day streak` : `${totalPhotos} photos`}
            </Text>
          </View>
          <CaretRight size={16} color={Colors.textTertiary} weight="regular" />
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

// ─── HomeScreen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { albums, photos, isLoading, addAlbum, updateAlbum, deleteAlbum } = useAppContext();
  const { greeting, dayNumber } = useGreeting();
  const [showNewAlbumModal, setShowNewAlbumModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [unlockTargetId, setUnlockTargetId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Album | null>(null);
  const { fonts, typography } = useFont();
  const { unlockAlbum } = useAlbumLock();

  // Sort albums by most-recent photo date (fallback to createdAt), newest first.
  const sortedAlbums = useMemo(() => {
    const maxPhotoDate: Record<string, string> = {};
    for (const p of photos) {
      const cur = maxPhotoDate[p.albumId];
      if (!cur || p.date > cur) maxPhotoDate[p.albumId] = p.date;
    }
    return [...albums].sort((a, b) => {
      const dateA = maxPhotoDate[a.id] ?? a.createdAt.slice(0, 10);
      const dateB = maxPhotoDate[b.id] ?? b.createdAt.slice(0, 10);
      return dateB.localeCompare(dateA);
    });
  }, [albums, photos]);

  function handleRenameRequest(album: Album) {
    setRenameTarget(album);
  }

  function handleConfirmRename(name: string) {
    if (!renameTarget) return;
    const trimmed = name.trim();
    if (trimmed) {
      updateAlbum(renameTarget.id, { name: trimmed });
      haptics.success();
    }
    setRenameTarget(null);
  }

  function handleDeleteRequest(album: Album) {
    if (albums.length <= 1) {
      haptics.error();
      Alert.alert('Cannot Delete', 'You must keep at least one album.');
      return;
    }
    Alert.alert(
      'Delete Album',
      `Delete "${album.name}" and all its photos? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { haptics.warning(); deleteAlbum(album.id); } },
      ],
    );
  }

  function handleUnlockRequest(albumId: string) {
    setUnlockTargetId(albumId);
    setShowPinModal(true);
  }

  function handlePinSuccess() {
    setShowPinModal(false);
    if (unlockTargetId) {
      unlockAlbum(unlockTargetId);
      router.push({ pathname: '/album/[id]', params: { id: unlockTargetId } });
      setUnlockTargetId(null);
    }
  }

  useEffect(() => {
    if (!isLoading && albums.length === 0) {
      router.replace('/onboarding');
    }
  }, [isLoading, albums.length, router]);

  function handleCreateAlbum() {
    haptics.tap();
    setShowNewAlbumModal(true);
  }

  function handleConfirmNewAlbum(name: string) {
    setShowNewAlbumModal(false);
    const trimmed = name.trim();
    if (!trimmed) return;
    addAlbum(createAlbum(trimmed));
    haptics.success();
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={[styles.content, { paddingHorizontal: CONTENT_PADDING }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.skeletonGreeting} />
              <View style={styles.skeletonDay} />
            </View>
          </View>
          <View style={styles.skeletonHero} />
        </View>
      </SafeAreaView>
    );
  }

  if (albums.length === 0) {
    return null;
  }

  const [heroAlbum, ...restAlbums] = sortedAlbums;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.greeting, { fontFamily: fonts.regular }]}>{greeting}</Text>
            <Text style={typography.small}>day {dayNumber}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.gearBtn, pressed && { opacity: 0.7 }]}
            onPress={() => { haptics.tap(); router.push('/(tabs)/profile'); }}
            hitSlop={12}
            accessibilityLabel="Settings"
            accessibilityRole="button"
          >
            <GearSix size={20} color={Colors.textPrimary} weight="regular" />
          </Pressable>
        </View>

        {/* Hero card */}
        <HeroCard
          albumId={heroAlbum.id}
          albumName={heroAlbum.name}
          albumCreatedAt={heroAlbum.createdAt}
          onUnlockRequest={handleUnlockRequest}
        />

        {/* Album list */}
        {restAlbums.length > 0 && (
          <View style={styles.list}>
            {restAlbums.map((album, index) => (
              <React.Fragment key={album.id}>
                {index > 0 && <View style={styles.divider} />}
                <AlbumRow
                  album={album}
                  onUnlockRequest={handleUnlockRequest}
                  onRenameRequest={handleRenameRequest}
                  onDeleteRequest={handleDeleteRequest}
                />
              </React.Fragment>
            ))}
          </View>
        )}

        {/* New album button */}
        <Pressable
          style={({ pressed }) => [styles.newAlbumRow, pressed && { opacity: 0.7 }]}
          onPress={handleCreateAlbum}
          accessibilityLabel="Create new album"
          accessibilityRole="button"
        >
          <View style={styles.newAlbumIcon}>
            <Plus size={20} color={Colors.accent} weight="regular" />
          </View>
          <Text style={[styles.newAlbumText, { fontFamily: fonts.regular }]}>new album</Text>
        </Pressable>
      </ScrollView>
      <TextInputModal
        visible={showNewAlbumModal}
        title="New Album"
        message="Enter a name for the album"
        placeholder="Album name"
        confirmLabel="Create"
        onConfirm={handleConfirmNewAlbum}
        onCancel={() => setShowNewAlbumModal(false)}
      />
      <TextInputModal
        visible={renameTarget !== null}
        title="Rename Album"
        placeholder="Album name"
        defaultValue={renameTarget?.name ?? ''}
        confirmLabel="Rename"
        onConfirm={handleConfirmRename}
        onCancel={() => setRenameTarget(null)}
      />
      <PinModal
        visible={showPinModal}
        intent="unlock"
        onSuccess={handlePinSuccess}
        onCancel={() => { setShowPinModal(false); setUnlockTargetId(null); }}
        onNoPinFound={() => {
          // PIN data gone — auto-clear the lock and navigate in
          if (unlockTargetId) {
            unlockAlbum(unlockTargetId);
            router.push({ pathname: '/album/[id]', params: { id: unlockTargetId } });
            setUnlockTargetId(null);
          }
          setShowPinModal(false);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bgPage,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: CONTENT_PADDING,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 20,
  },
  headerLeft: {
    gap: 2,
  },
  gearBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greeting: {
    fontFamily: Fonts.mono.regular,
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -1,
    color: Colors.textPrimary,
  },

  // Hero card
  heroCard: {
    width: '100%',
    height: HERO_HEIGHT,
    backgroundColor: Colors.bgCard,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  heroEmptyText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textTertiary,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },
  heroOverlay: {
    padding: 16,
    gap: 8,
  },
  heroOverlayTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroOverlayLeft: {
    gap: 2,
  },
  heroAlbumName: {
    fontFamily: Fonts.mono.regular,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  weekDayCol: {
    alignItems: 'center',
  },
  weekDot: {
    width: Sizes.weekDot,
    height: Sizes.weekDot,
    borderRadius: Sizes.weekDot / 2,
    backgroundColor: Colors.bgSurface,
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
  },
  weekDotFilled: {
    backgroundColor: Colors.streak,
    borderColor: Colors.streak,
  },
  weekDotToday: {
    borderColor: Colors.streak,
    backgroundColor: 'transparent',
  },
  weekDotDim: {
    opacity: 0.3,
  },

  // Album list
  list: {
    marginTop: 24,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderDivider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  thumbnail: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
  },
  thumbnailPlaceholder: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    backgroundColor: Colors.bgCard,
  },
  rowInfo: {
    flex: 1,
    gap: 3,
  },

  // Swipe row + actions
  rowInner: {
    backgroundColor: Colors.bgPage,
  },
  actionsContainer: {
    flexDirection: 'row',
  },
  actionBtn: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionRename: {
    backgroundColor: Colors.accentDeep,
  },
  actionDelete: {
    backgroundColor: Colors.danger,
  },
  actionLabel: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    lineHeight: 14,
    color: Colors.textPrimary,
  },

  // Skeleton
  skeletonGreeting: {
    width: 160,
    height: 28,
    backgroundColor: Colors.bgCard,
  },
  skeletonDay: {
    width: 60,
    height: 12,
    backgroundColor: Colors.bgCard,
    marginTop: 4,
  },
  skeletonHero: {
    width: '100%',
    height: 300,
    backgroundColor: Colors.bgCard,
  },

  // New album button
  newAlbumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    borderStyle: 'dashed',
    paddingHorizontal: 16,
  },
  newAlbumIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newAlbumText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.accent,
  },

});
