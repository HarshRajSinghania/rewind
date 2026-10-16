import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { RING_AHEAD, RING_BEHIND } from '@/utils/playback';
import TimelapsePlayer, { type TimelapsePlayerHandle } from '@/components/timelapse/TimelapsePlayer';
import { FontProvider } from '@/context/FontContext';
import { frameClocks } from '../helpers/reanimatedMock';
import type { FaceScan, PhotoEntry } from '@/types';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: { source?: { uri?: string } }) =>
      React.createElement(View, { testID: `image:${props.source?.uri}`, ...props }),
  };
});
jest.mock('phosphor-react-native', () => ({ Play: () => null, Pause: () => null, SkipBack: () => null, SkipForward: () => null }));

const LEVEL: FaceScan = { v: 1, eyes: { left: { x: 0.4, y: 0.5 }, right: { x: 0.6, y: 0.5 } }, width: 1000, height: 1000 };

function photo(i: number, faceScan: FaceScan | undefined = LEVEL): PhotoEntry {
  const date = `2026-03-${String(i + 1).padStart(2, '0')}`;
  return {
    id: `p-${i}`, albumId: 'a1', date, imageUri: `file:///document/${date}.jpg`, caption: '',
    capturedAt: `${date}T12:00:00.000Z`, cameraDirection: 'front', ...(faceScan ? { faceScan } : {}),
  };
}

const THREE = [photo(0), photo(1), photo(2, { ...LEVEL, eyes: null })];
const FORTY = Array.from({ length: 40 }, (_, i) => photo(i));
const uri = (p: PhotoEntry) => p.imageUri;

async function renderPlayer(props: Partial<React.ComponentProps<typeof TimelapsePlayer>> = {}, { layout = true } = {}) {
  await render(
    <FontProvider>
      <TimelapsePlayer photos={THREE} speed={1} {...props} />
    </FontProvider>,
  );
  if (layout) {
    await fireEvent(screen.getByTestId('timelapse-screen'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } } });
  }
}

function frames() {
  return screen.queryAllByTestId(/^frame:/).map((el) => {
    const u = String(el.props.testID).slice('frame:'.length);
    const image = screen.getByTestId(`image:${u}`);
    return {
      uri: u,
      visible: StyleSheet.flatten(el.props.style)?.opacity !== 0,
      image,
      style: StyleSheet.flatten(image.props.style) as Record<string, unknown>,
      contentFit: image.props.contentFit as string,
      transition: image.props.transition as number,
    };
  });
}

function shown() {
  const visible = frames().filter((f) => f.visible);
  expect(visible).toHaveLength(1);
  return visible[0];
}

const load = (p: PhotoEntry) => fireEvent(frames().find((f) => f.uri === uri(p))!.image, 'load');

beforeEach(() => {
  frameClocks.length = 0;
});

describe('TimelapsePlayer', () => {
  it('eye-locks a scanned frame with a hard cut', async () => {
    await renderPlayer({ align: true });
    const f = shown();
    // median eye distance = 200px * cover 0.4 = 80 -> scale 0.4 -> 400x400 image,
    // eye midpoint (500,500)*0.4 = (200,200) moved to the anchor (150,160).
    expect(f.uri).toBe(uri(THREE[0]));
    expect(f.style.position).toBe('absolute');
    expect(f.style.width).toBeCloseTo(400, 6);
    expect(f.style.left).toBeCloseTo(-50, 6);
    expect(f.style.top).toBeCloseTo(-40, 6);
    expect(f.style.transformOrigin).toEqual([200, 200, 0]);
    expect(f.style.transform).toEqual([{ rotate: '0rad' }]);
    expect(f.contentFit).toBe('fill');
    expect(f.transition).toBe(0);
  });

  it('never writes local frames back to the disk cache', async () => {
    // Glide re-encoded every decoded frame to disk at quality 100 (1-8/s during playback),
    // starving decodes; the photos are already local files.
    await renderPlayer({ align: true });
    expect(frames().every((f) => f.image.props.cachePolicy === 'memory')).toBe(true);
  });

  it('mounts the playhead, the frames after it and a few before it, showing only the playhead', async () => {
    await renderPlayer({ align: true, photos: FORTY });
    const ahead = FORTY.slice(0, RING_AHEAD + 1);
    const behind = FORTY.slice(40 - RING_BEHIND).reverse();
    expect(frames().map((f) => f.uri)).toEqual([...ahead, ...behind].map(uri));
    expect(shown().uri).toBe(uri(FORTY[0]));
  });

  it('plays unaligned with cover frames and hard cuts when alignment is off', async () => {
    await renderPlayer({ align: false });
    const f = shown();
    expect(f.contentFit).toBe('cover');
    expect(f.transition).toBe(0);
    expect(f.style.transform).toBeUndefined();
  });

  it('stays unaligned until the player has been measured', async () => {
    await renderPlayer({ align: true }, { layout: false });
    expect(shown().contentFit).toBe('cover');
  });

  it('keeps the shown frame on screen until a seek target loads', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await load(THREE[0]);
    await act(async () => { ref.current!.seekTo(1); });
    expect(shown().uri).toBe(uri(THREE[0]));
    await load(THREE[1]);
    expect(shown().uri).toBe(uri(THREE[1]));
  });

  it('counts a load error as loaded so a broken file cannot freeze playback', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await act(async () => { ref.current!.seekTo(1); });
    await fireEvent(frames().find((f) => f.uri === uri(THREE[1]))!.image, 'error');
    expect(shown().uri).toBe(uri(THREE[1]));
  });

  it('while scrubbing, decodes only the frame on screen and the one under the finger', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, photos: FORTY, ref, scrubbing: true });
    await act(async () => { ref.current!.seekTo(20); });
    expect(frames().map((f) => f.uri)).toEqual([uri(FORTY[0]), uri(FORTY[20])]);
  });

  it('decodes the full ring around the target again once scrubbing ends', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    const tree = (scrubbing: boolean) => (
      <FontProvider>
        <TimelapsePlayer photos={FORTY} speed={1} align ref={ref} scrubbing={scrubbing} />
      </FontProvider>
    );
    const { rerender } = await render(tree(true));
    await act(async () => { ref.current!.seekTo(20); });
    await rerender(tree(false));
    expect(frames()).toHaveLength(1 + 1 + RING_AHEAD + RING_BEHIND);
    expect(frames().map((f) => f.uri)).toContain(uri(FORTY[20 + RING_AHEAD]));
  });

  it('makes a frame that left the ring load again before it is shown', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, photos: FORTY, ref });
    await load(FORTY[15]);
    await act(async () => { ref.current!.seekTo(25); }); // ring 25..39,0 and 24..20 (+ shown 0): frame 15 unmounts
    expect(frames().map((f) => f.uri)).not.toContain(uri(FORTY[15]));
    await load(FORTY[25]);
    await act(async () => { ref.current!.seekTo(15); }); // back: a fresh view, not loaded yet
    expect(shown().uri).toBe(uri(FORTY[25]));
  });

  it('advances on the UI clock only when due and the next frame has loaded', async () => {
    const onFrameChange = jest.fn();
    const onPlayingChange = jest.fn();
    await renderPlayer({ align: true, onFrameChange, onPlayingChange });
    await load(THREE[0]);
    await load(THREE[1]);
    await fireEvent.press(screen.getByLabelText('Play'));
    expect(onPlayingChange).toHaveBeenLastCalledWith(true);
    const clock = frameClocks[frameClocks.length - 1];
    expect(clock.active).toBe(true);

    await act(async () => { clock.tick({ timestamp: 1000 }); }); // schedules frame 1 at 1500 (1x = 500ms)
    await act(async () => { clock.tick({ timestamp: 1499 }); });
    expect(shown().uri).toBe(uri(THREE[0]));
    await act(async () => { clock.tick({ timestamp: 1500 }); }); // swaps on the UI thread
    await act(async () => { clock.tick({ timestamp: 1600 }); }); // JS hears within REPORT_MS
    expect(shown().uri).toBe(uri(THREE[1]));
    expect(onFrameChange).toHaveBeenLastCalledWith(1);
  });

  it('keeps frames marked loaded when their loads land back to back', async () => {
    // On device, JS writes to a shared value land on the UI thread asynchronously while
    // JS reads see the UI copy: read-modify-write from JS lost the first of two quick
    // loads, and playback stalled forever waiting for that frame.
    await renderPlayer({ align: true });
    await load(THREE[0]);
    await load(THREE[1]); // no render between these two loads,
    await load(THREE[2]); // so the UI copy is still behind
    await fireEvent.press(screen.getByLabelText('Play'));
    const clock = frameClocks[frameClocks.length - 1];
    await act(async () => { clock.tick({ timestamp: 1000 }); });
    await act(async () => { clock.tick({ timestamp: 1500 }); });
    await act(async () => { clock.tick({ timestamp: 1600 }); });
    expect(shown().uri).toBe(uri(THREE[1]));
  });

  it('holds the frame while the next one is still loading', async () => {
    await renderPlayer({ align: true });
    await load(THREE[0]);
    await fireEvent.press(screen.getByLabelText('Play'));
    const clock = frameClocks[frameClocks.length - 1];
    await act(async () => { clock.tick({ timestamp: 1000 }); });
    await act(async () => { clock.tick({ timestamp: 3000 }); }); // frame 1 never loaded
    expect(shown().uri).toBe(uri(THREE[0]));
  });

  it('stops the clock on pause and reports it', async () => {
    const onPlayingChange = jest.fn();
    const onPlaybackEnd = jest.fn();
    await renderPlayer({ onPlayingChange, onPlaybackEnd });
    await fireEvent.press(screen.getByLabelText('Play'));
    await fireEvent.press(screen.getByLabelText('Pause'));
    expect(frameClocks[frameClocks.length - 1].active).toBe(false);
    expect(onPlayingChange).toHaveBeenLastCalledWith(false);
    expect(onPlaybackEnd).toHaveBeenLastCalledWith(0);
  });

  it('labels the date of the frame actually on screen', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    expect(screen.getByTestId('player-date').props.text).toBe('mar 1, 2026');
    await load(THREE[0]);
    await act(async () => { ref.current!.seekTo(1); }); // not decoded yet: still showing frame 0
    expect(screen.getByTestId('player-date').props.text).toBe('mar 1, 2026');
    await load(THREE[1]);
    expect(screen.getByTestId('player-date').props.text).toBe('mar 2, 2026');
  });

  it('drives a shared on-screen frame value when given one', async () => {
    const shownFrame = { value: 0 };
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref, shownFrame: shownFrame as never });
    await load(THREE[0]);
    await load(THREE[1]);
    await act(async () => { ref.current!.seekTo(1); });
    expect(shownFrame.value).toBe(1);
  });

  it('shows the aligning badge only while progress is given', async () => {
    await renderPlayer({ align: true, scanProgress: { done: 3, total: 10 } });
    expect(screen.getByText('aligning 3/10')).toBeTruthy();
  });

  it('hides the aligning badge without progress', async () => {
    await renderPlayer({ align: true, scanProgress: null });
    expect(screen.queryByText(/aligning/)).toBeNull();
  });
});
