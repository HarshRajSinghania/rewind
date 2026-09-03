import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { getToday, getWeekDays } from '@/utils/dates';
import { computeCurrentStreak, computeBestStreak, computeConsistency, computeDayStatus } from '@/utils/streak';
import type { DayStatus, WeekDay } from '@/types';

export function useStreak(albumId?: string, albumCreatedAt?: string) {
  const { photos, profile } = useAppContext();

  const filteredPhotos = useMemo(
    () => albumId ? photos.filter(p => p.albumId === albumId) : photos,
    [photos, albumId]
  );

  const photoDates = useMemo(
    () => new Set(filteredPhotos.map(p => p.date)),
    [filteredPhotos]
  );

  const referenceDate = (albumCreatedAt?.split('T')[0]) ?? profile.joinDate;

  const currentStreak = useMemo(() => {
    return computeCurrentStreak(photoDates, getToday(), referenceDate);
  }, [photoDates, referenceDate]);

  const bestStreak = useMemo(() => {
    return computeBestStreak(filteredPhotos.map(p => p.date));
  }, [filteredPhotos]);

  const consistency = useMemo(() => {
    return computeConsistency(filteredPhotos.length, referenceDate);
  }, [filteredPhotos, referenceDate]);

  const weekStatus = useMemo((): WeekDay[] => {
    const today = getToday();
    const weekDays = getWeekDays(today);
    // Use albumCreatedAt for disabled check if provided
    const startDate = albumCreatedAt ?? profile.joinDate;

    return weekDays.map(wd => {
      const status: DayStatus = computeDayStatus(wd.date, today, startDate, photoDates);
      return { ...wd, status };
    });
  }, [photoDates, profile.joinDate, albumCreatedAt]);

  return { currentStreak, bestStreak, consistency, weekStatus };
}
