import {
  computeCurrentStreak,
  computeBestStreak,
  computeConsistency,
  computeDayStatus,
} from '@/utils/streak';

const TODAY = '2026-03-10';

describe('computeCurrentStreak', () => {
  it('counts a run ending today', () => {
    const dates = new Set(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(computeCurrentStreak(dates, TODAY)).toBe(3);
  });

  it('starts from yesterday when today is missing', () => {
    const dates = new Set(['2026-03-08', '2026-03-09']);
    expect(computeCurrentStreak(dates, TODAY)).toBe(2);
  });

  it('stops at the first gap', () => {
    const dates = new Set(['2026-03-01', '2026-03-09', '2026-03-10']);
    expect(computeCurrentStreak(dates, TODAY)).toBe(2);
  });

  it('returns 0 with no photos', () => {
    expect(computeCurrentStreak(new Set(), TODAY)).toBe(0);
  });

  it('does not count days before the reference (join) date', () => {
    const dates = new Set(['2026-03-08', '2026-03-09', '2026-03-10']);
    expect(computeCurrentStreak(dates, TODAY, '2026-03-09')).toBe(2);
  });

  it('returns 0 when all photos predate the reference date', () => {
    const dates = new Set(['2026-03-01']);
    expect(computeCurrentStreak(dates, TODAY, '2026-03-09')).toBe(0);
  });
});

describe('computeBestStreak', () => {
  it('returns 0 for no photos', () => {
    expect(computeBestStreak([])).toBe(0);
  });

  it('returns 1 for a single photo', () => {
    expect(computeBestStreak(['2026-03-10'])).toBe(1);
  });

  it('finds the longest run regardless of input order', () => {
    const dates = ['2026-03-10', '2026-03-01', '2026-03-02', '2026-03-03', '2026-03-09'];
    expect(computeBestStreak(dates)).toBe(3);
  });

  it('resets the run across gaps', () => {
    expect(computeBestStreak(['2026-03-01', '2026-03-03', '2026-03-04'])).toBe(2);
  });
});

describe('computeConsistency', () => {
  it('returns 0 without a reference date or photos', () => {
    expect(computeConsistency(5, undefined)).toBe(0);
    expect(computeConsistency(0, '2026-03-01')).toBe(0);
  });

  it('computes a percentage capped at 100', () => {
    // 10-day window ending today with 5 photos → 50%
    const d = new Date();
    d.setDate(d.getDate() - 9);
    const ref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(computeConsistency(5, ref)).toBe(50);
    // More photos than days still caps at 100
    expect(computeConsistency(99, ref)).toBe(100);
  });
});

describe('computeDayStatus', () => {
  const dates = new Set(['2026-03-08', TODAY]);

  it('marks pre-start days disabled', () => {
    expect(computeDayStatus('2026-03-01', TODAY, '2026-03-05', dates)).toBe('disabled');
  });

  it('marks future days upcoming', () => {
    expect(computeDayStatus('2026-03-11', TODAY, '2026-03-01', dates)).toBe('upcoming');
  });

  it('marks today done/pending', () => {
    expect(computeDayStatus(TODAY, TODAY, '2026-03-01', dates)).toBe('today-done');
    expect(computeDayStatus(TODAY, TODAY, '2026-03-01', new Set())).toBe('today-pending');
  });

  it('marks past days captured/missed', () => {
    expect(computeDayStatus('2026-03-08', TODAY, '2026-03-01', dates)).toBe('captured');
    expect(computeDayStatus('2026-03-09', TODAY, '2026-03-01', dates)).toBe('missed');
  });
});
