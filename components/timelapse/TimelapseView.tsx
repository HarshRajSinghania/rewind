import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, CalendarBlank } from 'phosphor-react-native';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { haptics } from '@/utils/haptics';
import TimelapsePlayer from '@/components/timelapse/TimelapsePlayer';
import Scrubber from '@/components/timelapse/Scrubber';
import Filmstrip from '@/components/timelapse/Filmstrip';
import SpeedSelector from '@/components/timelapse/SpeedSelector';
import AlignToggle from '@/components/timelapse/AlignToggle';
import { useAppContext } from '@/context/AppContext';
import { useFaceScanBackfill } from '@/hooks/useFaceScanBackfill';
import { isFaceScanAvailable } from '@/utils/faceScan';
import DateRangeSheet from '@/components/timelapse/DateRangeSheet';
import { formatMMDD, useTimelapse } from '@/hooks/useTimelapse';

interface TimelapseViewProps {
  /** Header content rendered above the date range row */
  header: React.ReactNode;
  /** All timelapse state from useTimelapse hook */
  timelapse: ReturnType<typeof useTimelapse>;
  /** Extra style for SpeedSelector (e.g. bottom padding) */
  speedSelectorStyle?: object;
}

export default function TimelapseView({ header, timelapse, speedSelectorStyle }: TimelapseViewProps) {
  const { fonts } = useFont();
  const {
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
  } = timelapse;

  // Frame on screen, written by the player on the UI thread and read by the scrubber
  // and filmstrip, so the controls match the picture exactly at any speed.
  const shownFrame = useSharedValue(0);
  const [scrubbing, setScrubbing] = useState(false);
  const { settings, updateSettings } = useAppContext();
  // Hidden entirely when the native detector is missing (Expo Go / older dev client).
  const scanAvailable = isFaceScanAvailable();
  const align = scanAvailable && settings.alignFaces;
  // Scanning decodes images too; pause it while playing so playback gets the CPU.
  const scanProgress = useFaceScanBackfill(filteredPhotos, align && !isPlaying);

  if (filteredPhotos.length < 2) return null;

  return (
    <>
      {/* Outside the padded body: the header carries its own padding, like other screens'. */}
      {header}
      <View style={styles.container}>

        {/* Date range row */}
        <Pressable
          style={({ pressed }) => [styles.dateRangeRow, pressed && { opacity: 0.7 }]}
          onPress={() => { haptics.tap(); setShowDateRange(true); }}
          accessibilityLabel="Select date range"
          accessibilityRole="button"
        >
          <CalendarBlank
            size={14}
            color={hasDateFilter ? Colors.accent : Colors.textTertiary}
            weight="light"
          />
          <Text style={[styles.dateRangeText, hasDateFilter && styles.dateRangeTextActive, { fontFamily: fonts.regular }]}>
            {formatMMDD(rangeStart)}  —  {formatMMDD(rangeEnd)}
          </Text>
        </Pressable>

        {/* Player */}
        <View style={styles.playerArea}>
          <TimelapsePlayer
            ref={playerRef}
            photos={filteredPhotos}
            speed={speed}
            align={align}
            scanProgress={scanProgress.scanning ? scanProgress : null}
            onFrameChange={handleFrameChange}
            onPlaybackEnd={handlePlaybackEnd}
            onPlayingChange={handlePlayingChange}
            shownFrame={shownFrame}
            scrubbing={scrubbing}
          />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Scrubber
            currentIndex={displayIndex}
            total={filteredPhotos.length}
            startDate={filteredPhotos[0].date}
            endDate={filteredPhotos[filteredPhotos.length - 1].date}
            onSeek={handleSeek}
            onScrubChange={setScrubbing}
            frame={shownFrame}
          />
          <Filmstrip
            photos={filteredPhotos}
            currentIndex={filmstripIndex}
            onSelect={handleFilmstripSelect}
            frame={shownFrame}
          />
        </View>
        <SpeedSelector
          selectedSpeed={speed}
          onSelect={handleSpeedSelect}
          style={speedSelectorStyle}
          trailing={scanAvailable ? (
            <AlignToggle
              enabled={settings.alignFaces}
              onToggle={(alignFaces) => updateSettings({ alignFaces })}
            />
          ) : null}
        />
      </View>

      <DateRangeSheet
        visible={showDateRange}
        dates={allDates}
        startDate={rangeStart}
        endDate={rangeEnd}
        onApply={handleDateRangeApply}
        onClose={() => setShowDateRange(false)}
      />
    </>
  );
}

export function TimelapseEmpty({
  message,
  hasDateFilter,
  onAdjustRange,
}: {
  message: string;
  hasDateFilter: boolean;
  onAdjustRange: () => void;
}) {
  const { fonts } = useFont();
  return (
    <View style={styles.emptyContainer}>
      <Camera size={48} color={Colors.textTertiary} weight="light" />
      <Text style={[styles.emptyText, { fontFamily: fonts.regular }]}>{message}</Text>
      {hasDateFilter && (
        <Pressable onPress={onAdjustRange} style={({ pressed }) => [pressed && { opacity: 0.7 }]} accessibilityLabel="Adjust date range" accessibilityRole="button">
          <Text style={[styles.emptyLink, { fontFamily: fonts.regular }]}>adjust range</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
  },
  playerArea: {
    flex: 1,
    marginBottom: 4,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    marginBottom: 8,
  },
  dateRangeText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  dateRangeTextActive: {
    color: Colors.accent,
  },
  controls: {
    gap: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 28,
  },
  emptyText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
  emptyLink: {
    fontFamily: Fonts.mono.regular,
    fontSize: 12,
    color: Colors.accent,
    textDecorationLine: 'underline',
  },
});
