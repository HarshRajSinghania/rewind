import { getCalendars } from 'expo-localization';

// Module-level cache: call getCalendars() once at import time.
// Returns 0-indexed first weekday: 0=Sunday, 1=Monday, …, 6=Saturday.
// getCalendars()[0]?.firstWeekday uses 1=Sunday … 7=Saturday; undefined/null → fall back to 1 (Sunday).
let _firstWeekday: number | null = null;
export function getFirstWeekday(): number {
  if (_firstWeekday === null) {
    const raw = getCalendars()[0]?.firstWeekday ?? 1;
    _firstWeekday = (raw - 1) % 7; // convert to 0-indexed
  }
  return _firstWeekday;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function formatDateLabel(date: string): string {
  // "MARCH 9, 2026" format
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

export function getDayNumber(joinDate: string, currentDate?: string): number {
  const join = new Date(joinDate + 'T00:00:00');
  // Compare at date precision (today at midnight, not right now): comparing
  // against the current time inflates the count by half a day every afternoon.
  const current = new Date((currentDate ?? getToday()) + 'T00:00:00');
  // round (not floor): a DST-shortened 23h day must still count as one day
  const diff = Math.round((current.getTime() - join.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1); // Day 1 minimum, even with timezone edge cases
}

export function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Sun-origin label array; rotated at use-time by getFirstWeekday()
const _DAY_LABELS_SUN_ORIGIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function getWeekDays(referenceDate?: string): Array<{ date: string; dayLabel: string; dayNumber: number }> {
  const ref = referenceDate ? new Date(referenceDate + 'T12:00:00') : new Date();
  const firstWeekday = getFirstWeekday(); // 0=Sun, 1=Mon, …
  const dayOfWeek = ref.getDay(); // 0=Sun
  // How many days back to reach the locale's first weekday
  const offset = (dayOfWeek - firstWeekday + 7) % 7;
  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() - offset);

  const days: Array<{ date: string; dayLabel: string; dayNumber: number }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dow = d.getDay(); // 0=Sun
    const label = _DAY_LABELS_SUN_ORIGIN[dow];
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ date: dateStr, dayLabel: label, dayNumber: d.getDate() });
  }
  return days;
}

export function getCalendarMonth(year: number, month: number): Array<Array<string | null>> {
  // month is 1-based (1=Jan)
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const daysInMonth = lastDay.getDate();
  const startDow = firstDay.getDay(); // 0=Sun
  const firstWeekday = getFirstWeekday(); // 0=Sun, 1=Mon, …
  // Leading blank cells = how many columns before the 1st of the month
  const leadingBlanks = (startDow - firstWeekday + 7) % 7;

  const weeks: Array<Array<string | null>> = [];
  let currentWeek: Array<string | null> = [];

  // Pad start
  for (let i = 0; i < leadingBlanks; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    currentWeek.push(dateStr);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Pad end
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

export function formatMonthYear(year: number, month: number): string {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toLowerCase();
}

export function formatTime(iso: string, use24h: boolean = false): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !use24h });
}

