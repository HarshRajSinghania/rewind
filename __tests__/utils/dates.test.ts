import {
  getFirstWeekday,
  getDayNumber,
  getToday,
  formatDateLabel,
  getWeekDays,
  getCalendarMonth,
  formatMonthYear,
  formatTime,
} from '@/utils/dates';

describe('dates', () => {
  describe('getFirstWeekday', () => {
    it('maps expo-localization firstWeekday=1 (Sunday) to 0-indexed 0', () => {
      expect(getFirstWeekday()).toBe(0);
    });
  });

  describe('getDayNumber', () => {
    it('returns 1 for the join day itself', () => {
      expect(getDayNumber('2026-03-09', '2026-03-09')).toBe(1);
    });

    it('counts inclusive days', () => {
      expect(getDayNumber('2026-03-01', '2026-03-09')).toBe(9);
    });

    it('clamps to a minimum of 1 for future join dates', () => {
      expect(getDayNumber('2026-03-10', '2026-03-09')).toBe(1);
    });
  });

  describe('getToday', () => {
    it('returns a YYYY-MM-DD string for today', () => {
      expect(getToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('formatDateLabel', () => {
    it('formats as uppercase "MONTH D, YYYY"', () => {
      expect(formatDateLabel('2026-03-09')).toBe('MARCH 9, 2026');
    });
  });

  describe('getWeekDays', () => {
    it('returns 7 days starting on the locale week start (Sunday)', () => {
      // 2026-03-09 is a Monday; week should run Sun Mar 8 – Sat Mar 14
      const week = getWeekDays('2026-03-09');
      expect(week).toHaveLength(7);
      expect(week[0].date).toBe('2026-03-08');
      expect(week[6].date).toBe('2026-03-14');
      expect(week.map((d) => d.dayLabel)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
      expect(week[1].dayNumber).toBe(9);
    });
  });

  describe('getCalendarMonth', () => {
    it('lays out March 2026 (starts Sunday) with no leading blanks', () => {
      const weeks = getCalendarMonth(2026, 3);
      expect(weeks).toHaveLength(5);
      expect(weeks[0][0]).toBe('2026-03-01');
      expect(weeks[4][2]).toBe('2026-03-31');
      expect(weeks[4].slice(3)).toEqual([null, null, null, null]);
    });

    it('pads leading blanks when the month starts mid-week', () => {
      // 2026-04-01 is a Wednesday → 3 leading blanks with Sunday start
      const weeks = getCalendarMonth(2026, 4);
      expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
      expect(weeks[0][3]).toBe('2026-04-01');
    });

    it('covers February in a non-leap year', () => {
      const weeks = getCalendarMonth(2026, 2);
      const days = weeks.flat().filter(Boolean);
      expect(days).toHaveLength(28);
      expect(days[0]).toBe('2026-02-01');
      expect(days[27]).toBe('2026-02-28');
    });
  });

  describe('formatMonthYear', () => {
    it('lowercases "month year"', () => {
      expect(formatMonthYear(2026, 3)).toBe('march 2026');
    });
  });

  describe('formatTime', () => {
    it('formats 12h by default', () => {
      expect(formatTime('2026-03-09T14:30:00')).toBe('2:30 PM');
    });

    it('formats 24h when requested', () => {
      expect(formatTime('2026-03-09T14:30:00', true)).toBe('14:30');
    });
  });
});
