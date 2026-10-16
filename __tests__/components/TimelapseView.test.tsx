import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import TimelapseView from '@/components/timelapse/TimelapseView';
import { FontProvider } from '@/context/FontContext';
import type { useTimelapse } from '@/hooks/useTimelapse';
import type { PhotoEntry } from '@/types';

let mockAvailable = true;
let mockSettings = { alignFaces: true };
const mockUpdateSettings = jest.fn();
const mockBackfill = jest.fn();
const mockPlayer = jest.fn();

jest.mock('@/utils/faceScan', () => ({ isFaceScanAvailable: () => mockAvailable }));
jest.mock('@/context/AppContext', () => ({
  useAppContext: () => ({ settings: mockSettings, updateSettings: mockUpdateSettings }),
}));
jest.mock('@/hooks/useFaceScanBackfill', () => ({
  useFaceScanBackfill: (...args: unknown[]) => mockBackfill(...args),
}));
jest.mock('@/components/timelapse/TimelapsePlayer', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef((props: unknown) => { mockPlayer(props); return null; }) };
});
const mockScrubber = jest.fn();
jest.mock('@/components/timelapse/Scrubber', () => (props: unknown) => { mockScrubber(props); return null; });
jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
const mockFilmstrip = jest.fn();
jest.mock('@/components/timelapse/Filmstrip', () => (props: unknown) => { mockFilmstrip(props); return null; });
jest.mock('@/components/timelapse/DateRangeSheet', () => () => null);
jest.mock('phosphor-react-native', () => ({ CalendarBlank: () => null, Camera: () => null, UserFocus: () => null }));

function photo(date: string): PhotoEntry {
  return {
    id: `p-${date}`, albumId: 'a1', date, imageUri: `file:///document/${date}.jpg`,
    caption: '', capturedAt: `${date}T12:00:00.000Z`, cameraDirection: 'front',
  };
}

const PHOTOS = [photo('2026-03-08'), photo('2026-03-09')];

function timelapse(over: { isPlaying?: boolean; filmstripIndex?: number } = {}): ReturnType<typeof useTimelapse> {
  return {
    playerRef: { current: null }, speed: 1, displayIndex: 0, filteredPhotos: PHOTOS,
    isPlaying: over.isPlaying ?? false, filmstripIndex: over.filmstripIndex ?? 0, handlePlayingChange: jest.fn(),
    allDates: PHOTOS.map((p) => p.date), rangeStart: PHOTOS[0].date, rangeEnd: PHOTOS[1].date,
    hasDateFilter: false, showDateRange: false, setShowDateRange: jest.fn(),
    handleFrameChange: jest.fn(), handlePlaybackEnd: jest.fn(), handleSeek: jest.fn(),
    handleFilmstripSelect: jest.fn(), handleSpeedSelect: jest.fn(),
    handleDateRangeApply: jest.fn(), resetForAlbum: jest.fn(),
  } as unknown as ReturnType<typeof useTimelapse>;
}

async function renderView(over: { isPlaying?: boolean; filmstripIndex?: number } = {}) {
  await render(
    <FontProvider>
      <TimelapseView header={null} timelapse={timelapse(over)} />
    </FontProvider>,
  );
}

const lastPlayerProps = () => mockPlayer.mock.calls.at(-1)?.[0] as { align: boolean; scanProgress: unknown; onPlayingChange?: unknown };

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockSettings = { alignFaces: true };
  mockBackfill.mockReturnValue({ scanning: true, done: 1, total: 4 });
});

describe('TimelapseView face alignment wiring', () => {
  it('aligns, backfills, shows progress, and offers the toggle when the scanner is available', async () => {
    await renderView();
    expect(mockBackfill).toHaveBeenCalledWith(PHOTOS, true);
    expect(lastPlayerProps().align).toBe(true);
    expect(lastPlayerProps().scanProgress).toEqual({ scanning: true, done: 1, total: 4 });

    const toggle = screen.getByRole('switch', { name: 'align faces' });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ alignFaces: false });
  });

  it('plays unaligned and stops scanning when the setting is off', async () => {
    mockSettings = { alignFaces: false };
    await renderView();
    expect(mockBackfill).toHaveBeenCalledWith(PHOTOS, false);
    expect(lastPlayerProps().align).toBe(false);
    expect(screen.getByRole('switch', { name: 'align faces' })).not.toBeChecked();
  });

  it('hides the toggle and never aligns without the scanner', async () => {
    mockAvailable = false;
    await renderView();
    expect(screen.queryByRole('switch', { name: 'align faces' })).toBeNull();
    expect(mockBackfill).toHaveBeenCalledWith(PHOTOS, false);
    expect(lastPlayerProps().align).toBe(false);
  });

  it('pauses the face scan while playing', async () => {
    await renderView({ isPlaying: true });
    expect(mockBackfill).toHaveBeenCalledWith(PHOTOS, false);
  });

  it('passes the playing-state handler and the throttled filmstrip index', async () => {
    await renderView({ filmstripIndex: 1 });
    expect(typeof lastPlayerProps().onPlayingChange).toBe('function');
    expect(mockFilmstrip.mock.calls.at(-1)?.[0]).toMatchObject({ currentIndex: 1 });
  });

  it('gives the player, scrubber and filmstrip one shared on-screen frame', async () => {
    await renderView();
    const shared = (lastPlayerProps() as { shownFrame?: unknown }).shownFrame;
    expect(shared).toBeDefined();
    expect(mockScrubber.mock.calls.at(-1)?.[0]).toMatchObject({ frame: shared });
    expect(mockFilmstrip.mock.calls.at(-1)?.[0]).toMatchObject({ frame: shared });
  });

  it('passes no progress to the player when the backfill is idle', async () => {
    mockBackfill.mockReturnValue({ scanning: false, done: 0, total: 0 });
    await renderView();
    expect(lastPlayerProps().scanProgress).toBeNull();
  });
});
