import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Play, Pause, SkipBack, SkipForward } from 'phosphor-react-native';
import { haptics } from '@/utils/haptics';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';

function formatBadgeDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
}
import { getImageSource } from '@/utils/imageSource';
import { computeFaceTransform, medianEyeDistance, type Size } from '@/utils/faceAlign';
import { nextFrameDeadline } from '@/utils/playback';
import type { PhotoEntry } from '@/types';

export interface TimelapsePlayerHandle {
  seekTo: (index: number) => void;
  pause: () => void;
}

interface TimelapsePlayerProps {
  photos: PhotoEntry[];
  speed: number;
  /** Eye-lock each frame using its faceScan; frames without eyes play unaligned. */
  align?: boolean;
  /** Face-scan backfill progress; an "aligning n/m" badge shows while non-null. */
  scanProgress?: { done: number; total: number } | null;
  onFrameChange?: (index: number) => void;
  onPlaybackEnd?: (index: number) => void;
}

const TimelapsePlayer = forwardRef<TimelapsePlayerHandle, TimelapsePlayerProps>(
  function TimelapsePlayer({ photos, speed, align = false, scanProgress = null, onFrameChange, onPlaybackEnd }, ref) {
    const { fonts } = useFont();
    const [frameIndex, setFrameIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [size, setSize] = useState<Size | null>(null);
    const frameRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const speedRef = useRef(speed);
    const onFrameChangeRef = useRef(onFrameChange);
    const onPlaybackEndRef = useRef(onPlaybackEnd);

    speedRef.current = speed;
    onFrameChangeRef.current = onFrameChange;
    onPlaybackEndRef.current = onPlaybackEnd;

    // Pause without firing onPlaybackEnd — used for manual seeks.
    const pausePlayback = useCallback(() => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current as unknown as number);
        intervalRef.current = null;
      }
      setIsPlaying(false);
    }, []);

    useImperativeHandle(ref, () => ({
      seekTo(index: number) {
        // Fix 3: pause the live timer before snapping to the requested frame so
        // the next tick doesn't override the user's chosen position.
        pausePlayback();
        frameRef.current = index;
        setFrameIndex(index);
      },
      pause() {
        pausePlayback();
      },
    }), [pausePlayback]);

    const stopPlayback = useCallback(() => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current as unknown as number);
        intervalRef.current = null;
      }
      setIsPlaying(false);
      onPlaybackEndRef.current?.(frameRef.current);
    }, []);

    const startPlayback = useCallback(() => {
      if (photos.length <= 1) return;
      setIsPlaying(true);

      // Fixed deadlines, so each tick's render work doesn't stretch the frame interval.
      let deadline = Date.now();
      const schedule = () => {
        const now = Date.now();
        deadline = nextFrameDeadline(deadline, now, 500 / speedRef.current);
        intervalRef.current = setTimeout(() => {
          frameRef.current = frameRef.current >= photos.length - 1 ? 0 : frameRef.current + 1;
          setFrameIndex(frameRef.current);
          onFrameChangeRef.current?.(frameRef.current);
          if (intervalRef.current !== null) schedule();
        }, deadline - now) as unknown as ReturnType<typeof setTimeout>;
      };
      schedule();
    }, [photos.length]);

    useEffect(() => {
      return () => {
        if (intervalRef.current) clearTimeout(intervalRef.current as unknown as number);
      };
    }, []);

    // Fix 1 & 2: when the photo set shrinks (or changes size), stop any running
    // timer and clamp the frame index so photos[frameIndex] is never undefined.
    useEffect(() => {
      if (photos.length === 0) return;
      if (frameRef.current >= photos.length) {
        const clamped = photos.length - 1;
        frameRef.current = clamped;
        setFrameIndex(clamped);
      }
      // Stop a stale timer that was scheduled against the old photos.length.
      stopPlayback();
    }, [photos.length, stopPlayback]);

    const togglePlay = useCallback(() => {
      haptics.tap();
      if (isPlaying) stopPlayback();
      else startPlayback();
    }, [isPlaying, stopPlayback, startPlayback]);

    const skipPrev = useCallback(() => {
      haptics.tap();
      const next = frameRef.current > 0 ? frameRef.current - 1 : photos.length - 1;
      frameRef.current = next;
      setFrameIndex(next);
      onPlaybackEndRef.current?.(next);
    }, [photos.length]);

    const skipNext = useCallback(() => {
      haptics.tap();
      const next = frameRef.current < photos.length - 1 ? frameRef.current + 1 : 0;
      frameRef.current = next;
      setFrameIndex(next);
      onPlaybackEndRef.current?.(next);
    }, [photos.length]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    }, []);

    // One target eye distance per sequence, so the face is the same size in every frame.
    const targetEyeDist = useMemo(
      () => (align && size ? medianEyeDistance(photos.map((p) => p.faceScan), size) : null),
      [align, size, photos],
    );

    // Defensive clamp: guard against a render cycle before the useEffect fires.
    const safeIndex = photos.length > 0 ? Math.min(frameIndex, photos.length - 1) : 0;
    const current = photos[safeIndex];

    // Aligned playback buffers frames: each is mounted in its own layout and only shown
    // once it has loaded, so the screen never blanks or puts the old face at the new
    // transform (a single <Image> does one or the other). The next frame preloads hidden
    // so its tick swaps in at once — at 4x a frame only lasts 125ms.
    const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(() => new Set());
    const [lastShownId, setLastShownId] = useState<string | null>(null);
    const aligning = align && !!size && targetEyeDist != null;
    const next = photos.length > 1 ? photos[(safeIndex + 1) % photos.length] : undefined;
    const lastShown = photos.find((p) => p.id === lastShownId && loadedIds.has(p.id));
    const shown = !current || loadedIds.has(current.id) ? current : (lastShown ?? current);
    const bufferedFrames = aligning && current
      ? [shown, current, next].filter(
          (p, i, all): p is PhotoEntry => !!p && all.findIndex((q) => q?.id === p.id) === i,
        )
      : [];
    const bufferedKey = bufferedFrames.map((p) => p.id).join('|');
    const bufferedIdsRef = useRef<ReadonlySet<string>>(new Set());
    bufferedIdsRef.current = new Set(bufferedFrames.map((p) => p.id));

    useEffect(() => {
      if (shown && shown.id !== lastShownId) setLastShownId(shown.id);
    }, [shown?.id, lastShownId]);

    // Forget loads of frames that left the buffer: a remounted view must decode again.
    useEffect(() => {
      setLoadedIds((prev) => {
        const kept = [...prev].filter((id) => bufferedIdsRef.current.has(id));
        return kept.length === prev.size ? prev : new Set(kept);
      });
    }, [bufferedKey]);

    const markLoaded = useCallback((id: string) => {
      if (!bufferedIdsRef.current.has(id)) return; // late event from an unmounted frame
      setLoadedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    }, []);

    function frameProps(photo: PhotoEntry) {
      const layout = photo.faceScan && size && targetEyeDist
        ? computeFaceTransform(photo.faceScan, size, targetEyeDist)
        : null;
      if (!layout) return { style: StyleSheet.absoluteFill, contentFit: 'cover' as const };
      return {
        // Zoom is baked into width/height (not a scale transform) so expo-image
        // decodes at the frame's layout size, not the full-res photo (a zoom-capped
        // far-away face can still approach full res).
        style: {
          position: 'absolute' as const,
          left: layout.left,
          top: layout.top,
          width: layout.width,
          height: layout.height,
          transformOrigin: layout.transformOrigin,
          transform: [{ rotate: `${layout.rotation}rad` }],
        },
        contentFit: 'fill' as const,
      };
    }

    return (
      <View style={styles.wrapper}>
        <View style={styles.screen} onLayout={handleLayout} testID="timelapse-screen">
          {aligning ? (
            bufferedFrames.map((photo) => {
              const { style, contentFit } = frameProps(photo);
              const loaded = () => markLoaded(photo.id);
              return (
                <Image
                  key={photo.id}
                  source={getImageSource(photo.imageUri)}
                  style={[style, photo.id !== shown.id && styles.pendingFrame]}
                  contentFit={contentFit}
                  transition={0}
                  // Count an error as loaded too, so one broken file can't freeze playback.
                  onLoad={loaded}
                  onError={loaded}
                />
              );
            })
          ) : current && (
            <Image
              source={getImageSource(current.imageUri)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
          )}

          <View style={styles.badge}>
            <Text style={[styles.badgeText, { fontFamily: fonts.regular }]}>
              {current ? formatBadgeDate(current.date) : ''}
            </Text>
          </View>

          {scanProgress && (
            <View style={[styles.badge, styles.badgeRight]}>
              <Text style={[styles.badgeText, { fontFamily: fonts.regular }]}>
                {`aligning ${scanProgress.done}/${scanProgress.total}`}
              </Text>
            </View>
          )}

          {/* Transport overlaid at bottom of image */}
          <View style={styles.transport}>
            <Pressable onPress={skipPrev} hitSlop={12} style={styles.transportBtn}>
              <SkipBack size={18} color={Colors.textPrimary} weight="fill" />
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.playBtn}>
              {isPlaying ? (
                <Pause size={22} color={Colors.textPrimary} weight="fill" />
              ) : (
                <Play size={22} color={Colors.textPrimary} weight="fill" />
              )}
            </Pressable>
            <Pressable onPress={skipNext} hitSlop={12} style={styles.transportBtn}>
              <SkipForward size={18} color={Colors.textPrimary} weight="fill" />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
);

export default TimelapsePlayer;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  screen: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
  },
  badge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: Colors.bgPageTranslucent,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeRight: {
    left: undefined,
    right: 16,
  },
  pendingFrame: {
    opacity: 0,
  },
  badgeText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 10,
    color: Colors.textPrimary,
  },
  transport: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingVertical: 8,
    backgroundColor: 'rgba(26,26,28,0.6)',
  },
  transportBtn: {
    padding: 6,
  },
  playBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
