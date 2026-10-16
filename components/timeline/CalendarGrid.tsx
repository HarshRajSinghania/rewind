import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import PhotoImage from '@/components/ui/PhotoImage';
import { Colors, Fonts } from '@/constants/theme';
import { useFont } from '@/context/FontContext';
import { getCalendarMonth, getToday, getFirstWeekday } from '@/utils/dates';
import { getImageSource } from '@/utils/imageSource';
import type { PhotoEntry } from '@/types';

interface CalendarGridProps {
  year: number;
  month: number;
  photos: PhotoEntry[];
  joinDate: string;
  onDayPress: (date: string) => void;
  onEmptyDayPress?: (date: string) => void;
}

// Sun-origin; rotated at module load to start from the device locale's first weekday.
const _DAY_HEADERS_SUN_ORIGIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const _firstWeekday = getFirstWeekday(); // 0=Sun, 1=Mon, …
const DAY_HEADERS = [
  ..._DAY_HEADERS_SUN_ORIGIN.slice(_firstWeekday),
  ..._DAY_HEADERS_SUN_ORIGIN.slice(0, _firstWeekday),
];
// Cell size is dynamic — use flex instead of fixed width

export default function CalendarGrid({ year, month, photos, joinDate, onDayPress, onEmptyDayPress }: CalendarGridProps) {
  const { fonts } = useFont();
  const weeks = getCalendarMonth(year, month);
  const today = getToday();
  const photoMap = useMemo(
    () => new Map<string, PhotoEntry>(photos.map(p => [p.date, p])),
    [photos],
  );

  return (
    <View style={styles.container}>
      {/* Day headers */}
      <View style={styles.headerRow}>
        {DAY_HEADERS.map((label, i) => (
          <View key={i} style={styles.headerCell}>
            <Text style={[styles.headerText, { fontFamily: fonts.regular }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((date, di) => {
            if (date === null) {
              return <View key={di} style={styles.cell} />;
            }

            const photo = photoMap.get(date) ?? null;
            const isToday = date === today;
            const isFuture = date > today;
            const isBeforeJoin = date < joinDate;

            // Future day, or a day before the album's history with no photo
            if (isFuture || (isBeforeJoin && !photo)) {
              return (
                <View key={di} style={styles.cell}>
                  <Text style={[styles.dayNumber, { opacity: 0.3, fontFamily: fonts.regular }]}>
                    {parseInt(date.split('-')[2], 10)}
                  </Text>
                </View>
              );
            }

            // Today with photo
            if (isToday && photo) {
              return (
                <Pressable
                  key={di}
                  style={({ pressed }) => [styles.cell, styles.photoCell, styles.todayCell, pressed && { opacity: 0.8 }]}
                  onPress={() => onDayPress(date)}
                >
                  <PhotoImage
                    source={getImageSource(photo.imageUri)}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                </Pressable>
              );
            }

            // Today without photo
            if (isToday && !photo) {
              return (
                <View key={di} style={[styles.cell, styles.todayCell]}>
                  <Text style={[styles.dayNumber, styles.todayNumber, { fontFamily: fonts.regular }]}>
                    {parseInt(date.split('-')[2], 10)}
                  </Text>
                </View>
              );
            }

            // Past day with photo
            if (photo) {
              return (
                <Pressable
                  key={di}
                  style={({ pressed }) => [styles.cell, styles.photoCell, pressed && { opacity: 0.8 }]}
                  onPress={() => onDayPress(date)}
                >
                  <PhotoImage
                    source={getImageSource(photo.imageUri)}
                    style={styles.thumbnail}
                    contentFit="cover"
                  />
                </Pressable>
              );
            }

            // Past day, no photo (missed) — show dashed border so backfill affordance is discoverable
            if (onEmptyDayPress) {
              return (
                <Pressable
                  key={di}
                  style={({ pressed }) => [styles.cell, styles.emptyTappableCell, pressed && { opacity: 0.5 }]}
                  onPress={() => onEmptyDayPress(date)}
                >
                  <Text style={[styles.dayNumber, { fontFamily: fonts.regular }]}>
                    {parseInt(date.split('-')[2], 10)}
                  </Text>
                </Pressable>
              );
            }
            return (
              <View key={di} style={styles.cell}>
                <Text style={[styles.dayNumber, { fontFamily: fonts.regular }]}>
                  {parseInt(date.split('-')[2], 10)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headerText: {
    fontFamily: Fonts.mono.regular,
    fontSize: 11,
    color: Colors.textTertiary,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCell: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  todayCell: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.streak,
  },
  thumbnail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 0,
  },
  dayNumber: {
    fontFamily: Fonts.mono.regular,
    fontSize: 13,
    color: Colors.textTertiary,
  },
  todayNumber: {
    color: Colors.streak,
  },
  emptyTappableCell: {
    borderWidth: 1,
    borderColor: Colors.borderPrimary,
    // Dashed reads as "addable" but renders inconsistently on Android; keep it
    // on iOS and fall back to a subtle solid border elsewhere.
    ...Platform.select({ ios: { borderStyle: 'dashed' as const }, default: {} }),
  },
});
