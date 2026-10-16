import React, { useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Alert,
  StyleSheet,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import PhotoImage from '@/components/ui/PhotoImage';
import { X, Trash, PencilSimple, Check, ShareNetwork, Camera } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { formatDateLabel, formatTime, getDayNumber } from '@/utils/dates';
import { getImageSource } from '@/utils/imageSource';
import { haptics } from '@/utils/haptics';
import type { PhotoEntry } from '@/types';

interface PhotoModalProps {
  visible: boolean;
  photos: PhotoEntry[];
  initialIndex: number;
  joinDate: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdateCaption: (id: string, caption: string) => void;
  onRetake?: (albumId: string) => void;
}

// ─── ZoomableImage ────────────────────────────────────────────────────────────

interface ZoomableImageProps {
  uri: string;
  width: number;
  height: number;
}

function ZoomableImage({ uri, width, height }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(4, Math.max(1, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < 1.1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[{ width, height }, animatedStyle]}>
        <PhotoImage
          source={getImageSource(uri)}
          style={{ width, height }}
          contentFit="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── PhotoModal ───────────────────────────────────────────────────────────────

export default function PhotoModal({
  visible,
  photos,
  initialIndex,
  joinDate,
  onClose,
  onDelete,
  onUpdateCaption,
  onRetake,
}: PhotoModalProps) {
  const { fonts, typography } = useFont();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState('');


  const flatListRef = useRef<FlatList>(null);

  // Room for a 3:4 capture at full width; taller imported photos show whole (contain), narrower.
  const photoWidth = screenWidth;
  const photoHeight = Math.min(screenWidth * (4 / 3), screenHeight * 0.6);

  const safeInitialIndex = Math.max(0, Math.min(initialIndex, photos.length - 1));

  const handleVisible = useCallback(() => {
    const safeIdx = Math.max(0, Math.min(initialIndex, photos.length - 1));
    setCurrentIndex(safeIdx);
    setEditingCaption(false);
    setTimeout(() => {
      flatListRef.current?.scrollToIndex({ index: safeIdx, animated: false });
    }, 0);
  }, [initialIndex, photos.length]);

  const currentPhoto = photos[currentIndex] ?? null;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
        setEditingCaption(false);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 });

  function handleDeletePress() {
    if (!currentPhoto) return;
    haptics.warning();
    Alert.alert(
      'Delete Photo',
      'This photo will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptics.success();
            onDelete(currentPhoto.id);
          },
        },
      ],
    );
  }

  function handleCaptionEditPress() {
    if (!currentPhoto) return;
    haptics.tap();
    setCaptionDraft(currentPhoto.caption ?? '');
    setEditingCaption(true);
  }

  function handleCaptionSave() {
    if (!currentPhoto) return;
    haptics.success();
    onUpdateCaption(currentPhoto.id, captionDraft.trim());
    setEditingCaption(false);
  }

  async function handleShare() {
    if (!currentPhoto) return;
    haptics.tap();
    try {
      const { shareAsync } = await import('expo-sharing');
      await shareAsync(currentPhoto.imageUri);
    } catch (e) {
      console.warn('Share failed:', e);
    }
  }

  function handleRetake() {
    if (!currentPhoto || !onRetake) return;
    haptics.tap();
    onClose();
    onRetake(currentPhoto.albumId);
  }

  const renderItem = useCallback(
    ({ item }: { item: PhotoEntry }) => (
      <View style={[styles.page, { width: photoWidth }]}>
        <View style={[styles.imageContainer, { width: photoWidth, height: photoHeight }]}>
          <ZoomableImage uri={item.imageUri} width={photoWidth} height={photoHeight} />
        </View>
      </View>
    ),
    [photoWidth, photoHeight],
  );

  const keyExtractor = useCallback((item: PhotoEntry) => item.id, []);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      onShow={handleVisible}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* Backdrop */}
        <View style={[StyleSheet.absoluteFill, styles.backdrop]} pointerEvents="none" />

        {/* Tap-to-dismiss: fills the whole screen behind the content */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { haptics.tap(); onClose(); }} accessibilityLabel="Close photo viewer" accessibilityRole="button" />

        {/* Content */}
        <View style={styles.content} pointerEvents="box-none">
          {/* Close button */}
          <View style={[styles.closeRow, { paddingTop: insets.top + 8 }]}>
            <Pressable
              onPress={() => { haptics.tap(); onClose(); }}
              hitSlop={12}
              style={styles.closeBtn}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <X size={20} color={Colors.textSecondary} weight="light" />
            </Pressable>
          </View>

          {/* Pager — vertically centered via justifyContent */}
          {photos.length > 0 && (
              <FlatList
                ref={flatListRef}
                data={photos}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={safeInitialIndex}
                getItemLayout={(_, index) => ({
                  length: photoWidth,
                  offset: photoWidth * index,
                  index,
                })}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig.current}
                style={styles.pager}
              />
            )}

            {/* Metadata + caption */}
            {currentPhoto && (
              <View style={styles.meta}>
                <Text style={[typography.sectionLabel, styles.dateRow]}>
                  {formatDateLabel(currentPhoto.date)}
                  {'  ·  '}
                  {formatTime(currentPhoto.capturedAt)}
                  {'  ·  DAY '}
                  {getDayNumber(joinDate, currentPhoto.date)}
                </Text>

                {editingCaption ? (
                  <View style={styles.captionEditRow}>
                    <TextInput
                      style={[styles.captionInput, { fontFamily: fonts.regular }]}
                      value={captionDraft}
                      onChangeText={setCaptionDraft}
                      placeholder="add a caption..."
                      placeholderTextColor={Colors.textTertiary}
                      autoFocus
                      multiline
                      returnKeyType="done"
                      onSubmitEditing={handleCaptionSave}
                      maxLength={200}
                    />
                    <Pressable
                      onPress={handleCaptionSave}
                      hitSlop={12}
                      style={styles.captionAction}
                      accessibilityLabel="Save caption"
                      accessibilityRole="button"
                    >
                      <Check size={18} color={Colors.accent} weight="bold" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={handleCaptionEditPress}
                    style={styles.captionRow}
                    accessibilityLabel="Edit caption"
                    accessibilityRole="button"
                  >
                    <Text style={[typography.caption, styles.captionText]}>
                      {currentPhoto.caption || 'add a caption...'}
                    </Text>
                    <PencilSimple size={14} color={Colors.textSecondary} weight="light" />
                  </Pressable>
                )}

              </View>
            )}

          {/* Action toolbar — pinned to bottom */}
          {currentPhoto && (
            <View style={[styles.actionRow, { bottom: insets.bottom + 12 }]}>
              <Pressable style={styles.actionBtn} onPress={handleShare} accessibilityLabel="Share photo" accessibilityRole="button">
                <ShareNetwork size={22} color={Colors.textPrimary} weight="light" />
                <Text style={[styles.actionLabel, { fontFamily: fonts.regular }]}>share</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleRetake} accessibilityLabel="Retake photo" accessibilityRole="button">
                <Camera size={22} color={Colors.textPrimary} weight="light" />
                <Text style={[styles.actionLabel, { fontFamily: fonts.regular }]}>retake</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleDeletePress} accessibilityLabel="Delete photo" accessibilityRole="button">
                <Trash size={22} color={Colors.danger} weight="light" />
                <Text style={[styles.actionLabel, { fontFamily: fonts.regular, color: Colors.danger }]}>delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  closeRow: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pager: {
    flexGrow: 0,
  },
  page: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    overflow: 'hidden',
  },
  meta: {
    paddingHorizontal: 24,
    paddingTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  dateRow: {
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  captionText: {
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  captionEditRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
    paddingBottom: 4,
    width: '100%',
  },
  captionInput: {
    flex: 1,
    fontFamily: Fonts.mono.regular,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  captionAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
    minWidth: 60,
  },
  actionLabel: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
