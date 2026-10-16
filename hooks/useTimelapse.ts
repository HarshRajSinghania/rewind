import { useState, useRef, useCallback, useMemo } from 'react';
import type { PhotoEntry } from '@/types';
import { TimelapsePlayerHandle } from '@/components/timelapse/TimelapsePlayer';

/** While playing, the filmstrip (FlatList scroll + re-render) follows at most this often. */
export const FILMSTRIP_THROTTLE_MS = 500;

export function formatMMDD(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

interface UseTimelapseOptions {
  photos: PhotoEntry[];
}

export function useTimelapse({ photos }: UseTimelapseOptions) {
  const [speed, setSpeed] = useState(1);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [filmstripIndex, setFilmstripIndex] = useState(0);
  const isPlayingRef = useRef(false);
  const lastFilmstripAtRef = useRef(0);
  const playerRef = useRef<TimelapsePlayerHandle>(null);

  // Date range
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);
  const [showDateRange, setShowDateRange] = useState(false);

  // Derived
  const allDates = useMemo(() => photos.map((p) => p.date).sort(), [photos]);
  const rangeStart = dateRange?.start ?? (allDates[0] ?? '');
  const rangeEnd = dateRange?.end ?? (allDates[allDates.length - 1] ?? '');
  const filteredPhotos = useMemo(
    () => dateRange
      ? photos.filter((p) => p.date >= dateRange.start && p.date <= dateRange.end)
      : photos,
    [photos, dateRange],
  );
  const hasDateFilter = dateRange !== null;

  // Frames arrive ~10x/s while playing; the filmstrip follows at most every
  // FILMSTRIP_THROTTLE_MS then, and exactly when paused.
  const handleFrameChange = useCallback((index: number) => {
    setDisplayIndex(index);
    const now = Date.now();
    if (!isPlayingRef.current || now - lastFilmstripAtRef.current >= FILMSTRIP_THROTTLE_MS) {
      lastFilmstripAtRef.current = now;
      setFilmstripIndex(index);
    }
  }, []);

  const handlePlayingChange = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);

  const handlePlaybackEnd = useCallback((index: number) => {
    setDisplayIndex(index);
    setFilmstripIndex(index);
  }, []);

  const handleSeek = useCallback((index: number) => {
    setDisplayIndex(index);
    setFilmstripIndex(index);
    playerRef.current?.seekTo(index);
  }, []);

  const handleFilmstripSelect = useCallback((index: number) => {
    setDisplayIndex(index);
    setFilmstripIndex(index);
    playerRef.current?.seekTo(index);
  }, []);

  const handleSpeedSelect = useCallback((s: number) => setSpeed(s), []);

  function handleDateRangeApply(start: string, end: string) {
    const isAll = start === allDates[0] && end === allDates[allDates.length - 1];
    setDateRange(isAll ? null : { start, end });
    setShowDateRange(false);
    setDisplayIndex(0);
    setFilmstripIndex(0);
    playerRef.current?.seekTo(0);
  }

  function resetForAlbum() {
    setDateRange(null);
    setDisplayIndex(0);
    setFilmstripIndex(0);
    playerRef.current?.seekTo(0);
  }

  return {
    playerRef,
    speed,
    displayIndex,
    isPlaying,
    filmstripIndex,
    filteredPhotos,
    allDates,
    rangeStart,
    rangeEnd,
    hasDateFilter,
    showDateRange,
    setShowDateRange,
    handleFrameChange,
    handlePlayingChange,
    handlePlaybackEnd,
    handleSeek,
    handleFilmstripSelect,
    handleSpeedSelect,
    handleDateRangeApply,
    resetForAlbum,
  };
}
