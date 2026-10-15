import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import TimelapsePlayer, { type TimelapsePlayerHandle } from '@/components/timelapse/TimelapsePlayer';
import { FontProvider } from '@/context/FontContext';
import type { FaceScan, PhotoEntry } from '@/types';

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: { source?: { uri?: string } }) =>
      React.createElement(View, { testID: `frame:${props.source?.uri}`, ...props }),
  };
});
jest.mock('phosphor-react-native', () => ({
  Play: () => null,
  Pause: () => null,
  SkipBack: () => null,
  SkipForward: () => null,
}));

const LEVEL: FaceScan = { v: 1, eyes: { left: { x: 0.4, y: 0.5 }, right: { x: 0.6, y: 0.5 } }, width: 1000, height: 1000 };

function photo(date: string, faceScan?: FaceScan): PhotoEntry {
  return {
    id: `p-${date}`,
    albumId: 'a1',
    date,
    imageUri: `file:///document/${date}.jpg`,
    caption: '',
    capturedAt: `${date}T12:00:00.000Z`,
    cameraDirection: 'front',
    ...(faceScan ? { faceScan } : {}),
  };
}

const PHOTOS = [
  photo('2026-03-08', LEVEL),
  photo('2026-03-09', LEVEL),
  photo('2026-03-10', { ...LEVEL, eyes: null }),
];

type PlayerProps = Partial<React.ComponentProps<typeof TimelapsePlayer>>;

async function renderPlayer(props: PlayerProps = {}, { layout = true } = {}) {
  await render(
    <FontProvider>
      <TimelapsePlayer photos={PHOTOS} speed={1} {...props} />
    </FontProvider>,
  );
  if (layout) {
    await fireEvent(screen.getByTestId('timelapse-screen'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 400 } },
    });
  }
}

type FrameProps = { contentFit?: string; transition?: number; style: Record<string, unknown> };

const uriOf = (p: PhotoEntry) => p.imageUri;

/** Every rendered frame image, as { uri, visible, ...props }. */
function frames() {
  return screen.queryAllByTestId(/^frame:/).map((el) => ({
    ...(el.props as object),
    uri: String(el.props.testID).slice('frame:'.length),
    style: StyleSheet.flatten(el.props.style) as Record<string, unknown>,
    visible: StyleSheet.flatten(el.props.style)?.opacity !== 0,
    el,
  })) as (FrameProps & { uri: string; visible: boolean; el: ReturnType<typeof screen.getByTestId> })[];
}

/** The single frame actually on screen. */
function frame(): FrameProps & { uri: string } {
  const shown = frames().filter((f) => f.visible);
  expect(shown).toHaveLength(1);
  return shown[0];
}

describe('TimelapsePlayer alignment', () => {
  it('eye-locks a scanned frame with a hard cut', async () => {
    await renderPlayer({ align: true });
    const f = frame();
    // median eye distance = 200px * cover 0.4 = 80 -> scale 0.4 -> 400x400 image,
    // eye midpoint (500,500)*0.4 = (200,200) moved to the anchor (150,160).
    expect(f.style.position).toBe('absolute');
    expect(f.style.width).toBeCloseTo(400, 6);
    expect(f.style.height).toBeCloseTo(400, 6);
    expect(f.style.left).toBeCloseTo(-50, 6);
    expect(f.style.top).toBeCloseTo(-40, 6);
    expect(f.style.transformOrigin).toEqual([200, 200, 0]);
    expect(f.style.transform).toEqual([{ rotate: '0rad' }]);
    expect(f.contentFit).toBe('fill');
    expect(f.transition).toBe(0);
  });

  it('keeps the aligned frame on screen until the next one has loaded, then swaps', async () => {
    // A single <Image> either shows the old face at the new transform while the next
    // source decodes, or (with recyclingKey) blanks — measured on device as a flash on
    // most 4x transitions. The next frame must load hidden in its own layout first.
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await fireEvent(frames()[0].el, 'load'); // first frame decoded and on screen
    await act(async () => { ref.current!.seekTo(1); });

    const [old, next] = [frames().find((f) => f.uri === uriOf(PHOTOS[0]))!, frames().find((f) => f.uri === uriOf(PHOTOS[1]))!];
    expect(old.visible).toBe(true);
    expect(next.visible).toBe(false);
    expect(next.style.position).toBe('absolute'); // already in its own aligned layout
    expect((next as { recyclingKey?: string }).recyclingKey).toBeUndefined();

    await fireEvent(next.el, 'load');
    expect(frame().uri).toBe(uriOf(PHOTOS[1]));
    expect(frame().style.position).toBe('absolute');
    expect(frames().map((f) => f.uri)).not.toContain(uriOf(PHOTOS[0]));
  });

  it('preloads the next frame hidden so its turn swaps in at once', async () => {
    // At 4x a frame lasts 125ms; loading only when its turn comes (then waiting for
    // onLoad to round-trip through JS) misses that budget on device.
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await fireEvent(frames()[0].el, 'load');

    const preload = frames().find((f) => f.uri === uriOf(PHOTOS[1]))!;
    expect(preload.visible).toBe(false);
    await fireEvent(preload.el, 'load');

    await act(async () => { ref.current!.seekTo(1); });
    expect(frame().uri).toBe(uriOf(PHOTOS[1])); // no wait for a fresh load
    expect(frames().find((f) => f.uri === uriOf(PHOTOS[2]))?.visible).toBe(false); // next one queued
  });

  it('makes a frame that left the buffer load again before it is shown', async () => {
    // A remounted view starts blank; trusting its earlier load would flash.
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await fireEvent(frames()[0].el, 'load');
    await fireEvent(frames().find((f) => f.uri === uriOf(PHOTOS[1]))!.el, 'load');

    await act(async () => { ref.current!.seekTo(2); }); // photo 1 drops out of the buffer
    expect(frames().map((f) => f.uri)).not.toContain(uriOf(PHOTOS[1]));
    await act(async () => { ref.current!.seekTo(1); }); // ...and comes back
    expect(frame().uri).toBe(uriOf(PHOTOS[0]));
    expect(frames().find((f) => f.uri === uriOf(PHOTOS[1]))?.visible).toBe(false);
  });

  it('swaps on a load error too, so a broken file cannot freeze playback', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await fireEvent(frames()[0].el, 'load');
    await act(async () => { ref.current!.seekTo(1); });
    expect(frame().uri).toBe(uriOf(PHOTOS[0]));
    await fireEvent(frames().find((f) => f.uri === uriOf(PHOTOS[1]))!.el, 'error');
    expect(frame().uri).toBe(uriOf(PHOTOS[1]));
  });

  it('plays as before when alignment is off', async () => {
    await renderPlayer({ align: false });
    const f = frame();
    expect(f.contentFit).toBe('cover');
    expect(f.transition).toBe(150);
    expect(f.style.transform).toBeUndefined();
  });

  it('plays a frame without eyes unaligned', async () => {
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    await act(async () => { ref.current!.seekTo(2); });
    await fireEvent(frames().find((f) => f.uri === uriOf(PHOTOS[2]))!.el, 'load');
    expect(frame().contentFit).toBe('cover');
  });

  it('stays unaligned until the player has been measured', async () => {
    await renderPlayer({ align: true }, { layout: false });
    expect(frame().contentFit).toBe('cover');
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
