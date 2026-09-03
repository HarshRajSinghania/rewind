import { renderHook, act } from '@testing-library/react-native';
import { useTimelapse, formatMMDD } from '@/hooks/useTimelapse';
import type { PhotoEntry } from '@/types';

function makePhoto(date: string): PhotoEntry {
  return {
    id: `photo-${date}`,
    albumId: 'album-1',
    date,
    imageUri: `file:///${date}.jpg`,
    caption: '',
    capturedAt: `${date}T12:00:00.000Z`,
    cameraDirection: 'front',
  };
}

const photos = ['2026-03-08', '2026-03-09', '2026-03-10'].map(makePhoto);

describe('formatMMDD', () => {
  it('formats a date as MM-DD', () => {
    expect(formatMMDD('2026-03-09')).toBe('03-09');
  });
});

describe('useTimelapse', () => {
  it('exposes all photos unfiltered by default', async () => {
    const { result } = await renderHook(() => useTimelapse({ photos }));
    expect(result.current.filteredPhotos).toHaveLength(3);
    expect(result.current.hasDateFilter).toBe(false);
    expect(result.current.rangeStart).toBe('2026-03-08');
    expect(result.current.rangeEnd).toBe('2026-03-10');
  });

  it('applies and clears a date range', async () => {
    const { result } = await renderHook(() => useTimelapse({ photos }));

    await act(async () => {
      result.current.handleDateRangeApply('2026-03-09', '2026-03-10');
    });
    expect(result.current.hasDateFilter).toBe(true);
    expect(result.current.filteredPhotos.map((p) => p.date)).toEqual(['2026-03-09', '2026-03-10']);

    // Full range is equivalent to no filter
    await act(async () => {
      result.current.handleDateRangeApply('2026-03-08', '2026-03-10');
    });
    expect(result.current.hasDateFilter).toBe(false);
    expect(result.current.filteredPhotos).toHaveLength(3);
  });

  it('tracks speed and display index', async () => {
    const { result } = await renderHook(() => useTimelapse({ photos }));
    await act(async () => {
      result.current.handleSpeedSelect(2);
    });
    expect(result.current.speed).toBe(2);
    await act(async () => {
      result.current.handleSeek(2);
    });
    expect(result.current.displayIndex).toBe(2);
  });

  it('handles an empty album without crashing', async () => {
    const { result } = await renderHook(() => useTimelapse({ photos: [] }));
    expect(result.current.filteredPhotos).toEqual([]);
    expect(result.current.rangeStart).toBe('');
    expect(result.current.rangeEnd).toBe('');
  });
});
