import { getDayNumber } from '@/utils/dates';
import type { DayStatus } from '@/types';

/**
 * Pure streak/stat math, extracted from useStreak so it can be unit-tested
 * without React. The hook in hooks/useStreak.ts is a thin memoization wrapper
 * around these functions — behavior lives here.
 */

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive-day streak ending today (or yesterday if today is missing). */
export function computeCurrentStreak(
  photoDates: Set<string>,
  today: string,
  referenceDate?: string,
): number {
  let streak = 0;
  const d = new Date(today + 'T12:00:00');

  // Check if today has a photo, if not start from yesterday
  if (!photoDates.has(today)) {
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const dateStr = toDateStr(d);
    // Do not count days before the album/profile join date
    if (referenceDate && dateStr < referenceDate) {
      break;
    }
    if (photoDates.has(dateStr)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/** Longest consecutive-day run in the given date list (YYYY-MM-DD strings). */
export function computeBestStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1] + 'T00:00:00');
    const curr = new Date(sorted[i] + 'T00:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      current++;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }

  return best;
}

/** % of days since start that have a photo (capped at 100). */
export function computeConsistency(photoCount: number, referenceDate?: string): number {
  if (!referenceDate || photoCount === 0) return 0;
  const daysSinceStart = getDayNumber(referenceDate);
  if (daysSinceStart <= 0) return 100; // First day — 100% if any photo exists
  return Math.min(100, Math.round((photoCount / daysSinceStart) * 100));
}

/** Status of a single calendar day for the week strip. */
export function computeDayStatus(
  date: string,
  today: string,
  startDate: string | undefined,
  photoDates: Set<string>,
): DayStatus {
  if (startDate && date < startDate) {
    return 'disabled';
  } else if (date > today) {
    return 'upcoming';
  } else if (date === today) {
    return photoDates.has(today) ? 'today-done' : 'today-pending';
  } else {
    return photoDates.has(date) ? 'captured' : 'missed';
  }
}

/**
 * First day an album's history covers: its creation day (or the profile's join date)
 * or its earliest photo, whichever is earlier — imported or backfilled photos predate
 * the album. Always a plain YYYY-MM-DD, so it compares correctly with photo dates.
 */
export function trackingStartDate(
  createdAt: string | undefined,
  joinDate: string,
  photoDates: Iterable<string>,
): string {
  let start = (createdAt ?? joinDate).slice(0, 10);
  for (const date of photoDates) {
    if (date < start) start = date;
  }
  return start;
}
