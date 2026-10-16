import React, { useEffect, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import PhotoImage from '@/components/ui/PhotoImage';
import { getImageSource } from '@/utils/imageSource';
import type { PhotoEntry } from '@/types';

interface FilmstripProps {
  photos: PhotoEntry[];
  currentIndex: number;
  onSelect: (index: number) => void;
  /** Frame on screen, driven by the player on the UI thread; highlight + scroll follow it exactly. */
  frame?: SharedValue<number>;
}

const ITEM_WIDTH = 42; // 38 thumb + 4 margin
const INACTIVE_OPACITY = 0.4;

const FilmstripItem = React.memo(function FilmstripItem({
  item,
  index,
  isActive,
  onSelect,
  frame,
}: {
  item: PhotoEntry;
  index: number;
  isActive: boolean;
  onSelect: (index: number) => void;
  frame?: SharedValue<number>;
}) {
  const highlight = useAnimatedStyle(() => ({
    opacity: (frame ? frame.value === index : isActive) ? 1 : INACTIVE_OPACITY,
  }));
  return (
    <Pressable onPress={() => onSelect(index)} style={styles.itemWrapper}>
      <Animated.View testID={`filmstrip-thumb-${index}`} style={[styles.thumb, highlight]}>
        <PhotoImage
          source={getImageSource(item.imageUri)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={item.id}
        />
      </Animated.View>
    </Pressable>
  );
});

function Filmstrip({ photos, currentIndex, onSelect, frame }: FilmstripProps) {
  const listRef = useAnimatedRef<FlatList<PhotoEntry>>();
  const viewportWidth = useSharedValue(0);

  // With a shared frame, centre it on the UI thread every frame; otherwise follow the prop.
  useAnimatedReaction(
    () => (frame ? frame.value : -1),
    (index, previous) => {
      if (index < 0 || index === previous) return;
      scrollTo(listRef, Math.max(0, index * ITEM_WIDTH + ITEM_WIDTH / 2 - viewportWidth.value / 2), 0, false);
    },
    [frame],
  );

  useEffect(() => {
    if (frame || photos.length === 0) return;
    listRef.current?.scrollToIndex({
      index: currentIndex,
      animated: false,
      viewPosition: 0.5,
    });
  }, [frame, currentIndex, photos.length, listRef]);

  const getItemLayout = useCallback((_: unknown, index: number) => ({
    length: ITEM_WIDTH,
    offset: ITEM_WIDTH * index,
    index,
  }), []);

  const renderItem = useCallback(({ item, index }: { item: PhotoEntry; index: number }) => (
    <FilmstripItem
      item={item}
      index={index}
      isActive={index === currentIndex}
      onSelect={onSelect}
      frame={frame}
    />
  ), [currentIndex, onSelect, frame]);

  const keyExtractor = useCallback((item: PhotoEntry) => item.id, []);

  return (
    <Animated.FlatList
      ref={listRef}
      onLayout={(e) => { viewportWidth.value = e.nativeEvent.layout.width; }}
      data={photos}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScrollToIndexFailed={() => {}}
      getItemLayout={getItemLayout}
      renderItem={renderItem}
      extraData={currentIndex}
      windowSize={5}
      maxToRenderPerBatch={10}
      initialNumToRender={10}
      removeClippedSubviews
    />
  );
}

export default React.memo(Filmstrip);

const styles = StyleSheet.create({
  itemWrapper: {
    marginHorizontal: 2,
  },
  thumb: {
    width: 38,
    height: 48,
    borderRadius: 0,
    overflow: 'hidden',
  },
});
