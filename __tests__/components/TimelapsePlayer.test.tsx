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
    Image: (props: Record<string, unknown>) => React.createElement(View, { testID: 'frame', ...props }),
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

function frame(): FrameProps {
  const el = screen.getByTestId('frame');
  return { ...(el.props as object), style: StyleSheet.flatten(el.props.style) } as FrameProps;
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

  it('clears an aligned frame while the next one loads instead of showing it at the new position', async () => {
    // expo-image keeps the previous source on screen until the new one decodes, but the
    // new frame's layout applies immediately — without a per-frame recyclingKey the old
    // face jumps to the new transform for the decode latency.
    const ref = React.createRef<TimelapsePlayerHandle>();
    await renderPlayer({ align: true, ref });
    expect((frame() as { recyclingKey?: string }).recyclingKey).toBe(PHOTOS[0].id);
    await act(async () => { ref.current!.seekTo(1); });
    expect((frame() as { recyclingKey?: string }).recyclingKey).toBe(PHOTOS[1].id);
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
