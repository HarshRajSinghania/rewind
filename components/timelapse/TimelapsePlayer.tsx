import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { useSharedValue, useFrameCallback } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Play, Pause, SkipBack, SkipForward } from 'phosphor-react-native';
import { haptics } from '@/utils/haptics';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import PlayerFrame, { type FrameLayout } from '@/components/timelapse/PlayerFrame';
import { computeFaceTransform, medianEyeDistance, type Size } from '@/utils/faceAlign';
import { frameInterval, playbackStep, ringWindow, RING_SIZE } from '@/utils/playback';
import type { PhotoEntry } from '@/types';

function formatBadgeDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
}

/** How often the UI-thread clock tells JS where it is (ring refill, scrubber, badge). */
const REPORT_MS = 100;

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
  onPlayingChange?: (playing: boolean) => void;
}

/**
 * Timelapse player. Frames switch on the UI thread: a Reanimated frame callback owns
 * the playhead and only advances once the next frame has decoded, while JS keeps a ring
 * of upcoming frames mounted (each in its own aligned layout) and hears from the clock
 * ~10x/s. No React render or JS timer per frame, so it holds ~30 photos/sec.
 */
const TimelapsePlayer = forwardRef<TimelapsePlayerHandle, TimelapsePlayerProps>(
  function TimelapsePlayer(
    { photos, speed, align = false, scanProgress = null, onFrameChange, onPlaybackEnd, onPlayingChange },
    ref,
  ) {
    const { fonts } = useFont();
    const [isPlaying, setIsPlaying] = useState(false);
    const [size, setSize] = useState<Size | null>(null);
    // JS mirror of the UI-thread playhead (`frame`) and the frame on screen (`shown`),
    // refreshed ~10x/s while playing and exactly on pause/seek.
    const [view, setView] = useState({ frame: 0, shown: 0 });
    const photosRef = useRef(photos);
    photosRef.current = photos;
    const callbacks = useRef({ onFrameChange, onPlaybackEnd, onPlayingChange });
    callbacks.current = { onFrameChange, onPlaybackEnd, onPlayingChange };

    const frame = useSharedValue(0);
    const shown = useSharedValue(0);
    const dueAt = useSharedValue(0);
    const lastReport = useSharedValue(0);
    const interval = useSharedValue(frameInterval(speed));
    const ids = useSharedValue<string[]>(photos.map((p) => p.id));
    const loaded = useSharedValue<Record<string, true>>({});

    useEffect(() => { interval.value = frameInterval(speed); }, [speed, interval]);
    useEffect(() => { ids.value = photos.map((p) => p.id); }, [photos, ids]);

    const report = useCallback((f: number, s: number) => {
      setView((prev) => (prev.frame === f && prev.shown === s ? prev : { frame: f, shown: s }));
      callbacks.current.onFrameChange?.(f);
    }, []);

    // UI-thread clock: advance only when due and the next frame has decoded (else hold).
    const clock = useFrameCallback((info) => {
      'worklet';
      const n = ids.value.length;
      if (n < 2) return;
      if (dueAt.value === 0) dueAt.value = info.timestamp + interval.value;
      const next = (frame.value + 1) % n;
      const step = playbackStep(info.timestamp, dueAt.value, interval.value, loaded.value[ids.value[next]] === true);
      dueAt.value = step.dueAt;
      if (step.advance) {
        frame.value = next;
        shown.value = next;
      }
      if (info.timestamp - lastReport.value >= REPORT_MS) {
        lastReport.value = info.timestamp;
        scheduleOnRN(report, frame.value, shown.value);
      }
    }, false);
    const clockRef = useRef(clock);
    clockRef.current = clock;

    const setPlaying = useCallback((playing: boolean) => {
      clockRef.current.setActive(playing);
      setIsPlaying(playing);
      callbacks.current.onPlayingChange?.(playing);
    }, []);

    const play = useCallback(() => {
      if (photosRef.current.length <= 1) return;
      dueAt.value = 0;
      lastReport.value = 0;
      setPlaying(true);
    }, [dueAt, lastReport, setPlaying]);

    const pause = useCallback((notifyEnd: boolean) => {
      setPlaying(false);
      setView({ frame: frame.value, shown: shown.value });
      if (notifyEnd) callbacks.current.onPlaybackEnd?.(frame.value);
    }, [frame, shown, setPlaying]);

    // Seek: move the playhead now; keep showing the old frame until the target decodes.
    const seek = useCallback((index: number) => {
      setPlaying(false);
      frame.value = index;
      const id = photosRef.current[index]?.id;
      if (id && loaded.value[id]) shown.value = index;
      setView({ frame: index, shown: shown.value });
    }, [frame, shown, loaded, setPlaying]);

    useImperativeHandle(ref, () => ({ seekTo: seek, pause: () => pause(false) }), [seek, pause]);

    // Ring: the frame on screen plus the playhead and the frames after it.
    const ringFrames = useMemo(() => {
      const list = [view.shown, ...ringWindow(view.frame, photos.length, RING_SIZE)];
      return list.filter((f, i) => f < photos.length && list.indexOf(f) === i);
    }, [view, photos.length]);
    const ringIdsRef = useRef<ReadonlySet<string>>(new Set());
    ringIdsRef.current = new Set(ringFrames.map((f) => photos[f].id));

    const markLoaded = useCallback((id: string) => {
      if (!ringIdsRef.current.has(id)) return; // late event from an unmounted frame
      if (!loaded.value[id]) loaded.value = { ...loaded.value, [id]: true };
      const f = frame.value;
      if (photosRef.current[f]?.id === id && shown.value !== f) {
        shown.value = f; // paused on a frame that just finished decoding
        setView({ frame: f, shown: f });
      }
    }, [frame, shown, loaded]);

    const forget = useCallback((id: string) => {
      if (!loaded.value[id]) return;
      const next = { ...loaded.value };
      delete next[id];
      loaded.value = next;
    }, [loaded]);

    // When the photo set changes size, clamp the playhead and stop a clock running
    // against the old set.
    useEffect(() => {
      if (photos.length === 0) return;
      if (frame.value >= photos.length) seek(photos.length - 1);
      pause(true);
    }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
    }, []);

    // One target eye distance per sequence, so the face is the same size in every frame.
    const targetEyeDist = useMemo(
      () => (align && size ? medianEyeDistance(photos.map((p) => p.faceScan), size) : null),
      [align, size, photos],
    );

    const frameLayout = (photo: PhotoEntry): FrameLayout => {
      const layout = align && photo.faceScan && size && targetEyeDist
        ? computeFaceTransform(photo.faceScan, size, targetEyeDist)
        : null;
      if (!layout) return { style: StyleSheet.absoluteFill, contentFit: 'cover' };
      return {
        // Zoom is baked into width/height (not a scale transform) so expo-image
        // decodes at the frame's layout size, not the full-res photo.
        style: {
          position: 'absolute',
          left: layout.left,
          top: layout.top,
          width: layout.width,
          height: layout.height,
          transformOrigin: layout.transformOrigin,
          transform: [{ rotate: `${layout.rotation}rad` }],
        },
        contentFit: 'fill',
      };
    };

    const togglePlay = () => {
      haptics.tap();
      if (isPlaying) pause(true);
      else play();
    };

    const skip = (delta: number) => {
      haptics.tap();
      const n = photos.length;
      if (n === 0) return;
      const target = (view.frame + delta + n) % n;
      seek(target);
      callbacks.current.onPlaybackEnd?.(target);
    };

    const current = photos.length > 0 ? photos[Math.min(view.shown, photos.length - 1)] : undefined;

    return (
      <View style={styles.wrapper}>
        <View style={styles.screen} onLayout={handleLayout} testID="timelapse-screen">
          {ringFrames.map((f) => (
            <PlayerFrame
              key={photos[f].id}
              photo={photos[f]}
              frameIndex={f}
              shown={shown}
              layout={frameLayout(photos[f])}
              onLoaded={markLoaded}
              onUnmount={forget}
            />
          ))}

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
            <Pressable onPress={() => skip(-1)} hitSlop={12} style={styles.transportBtn} accessibilityRole="button" accessibilityLabel="Previous frame">
              <SkipBack size={18} color={Colors.textPrimary} weight="fill" />
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.playBtn} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <Pause size={22} color={Colors.textPrimary} weight="fill" />
              ) : (
                <Play size={22} color={Colors.textPrimary} weight="fill" />
              )}
            </Pressable>
            <Pressable onPress={() => skip(1)} hitSlop={12} style={styles.transportBtn} accessibilityRole="button" accessibilityLabel="Next frame">
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
