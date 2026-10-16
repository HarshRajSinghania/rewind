import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import FaceGraph from '@/components/timelapse/FaceGraph';
import type { TrendPhoto } from '@/utils/faceTrend';
import type { FaceMeasure } from '@/types';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  const Box = ({ children, ...p }: { children?: React.ReactNode }) => <View {...p}>{children}</View>;
  return { __esModule: true, default: Box, Svg: Box, Path: Box };
});

const base: FaceMeasure = { ipd: 200, closeness: 0.2, jaw: 2, lowJaw: 1.5, cheek: 2.5, yaw: 0, pitch: 10, roll: 0, smile: 0, jawOpen: 0 };
const iso = (d: number) => new Date(Date.UTC(2025, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const album: TrendPhoto[] = Array.from({ length: 100 }, (_, d) => ({ id: `p${d}`, date: iso(d), faceScan: { v: 2, eyes: null, width: 1, height: 1, measure: base } }));

it('puts the dot on the frame shown on screen', async () => {
  await render(<FaceGraph trendPhotos={album} framePhotos={album} frame={{ value: 99 } as never} />);
  await fireEvent(screen.getByTestId('face-graph'), 'layout', { nativeEvent: { layout: { width: 300, height: 24 } } });
  const dot = StyleSheet.flatten(screen.getByTestId('face-graph-dot').props.style);
  expect(dot.transform).toEqual([{ translateX: 300 - 3 }, { translateY: expect.any(Number) }]);
  expect(dot.opacity).toBe(1);
});

it('hides when the frames in range have no trend', async () => {
  const far: TrendPhoto[] = [{ id: 'x', date: iso(400) }, { id: 'y', date: iso(401) }];
  await render(<FaceGraph trendPhotos={album} framePhotos={far} frame={{ value: 0 } as never} />);
  expect(screen.queryByTestId('face-graph')).toBeNull();
});

it('does not redraw while the timelapse re-renders around it with the same photos', async () => {
  // TimelapseView re-renders ~10x/s while playing; the graph must not rebuild each time.
  const svg = jest.requireMock('react-native-svg') as { Path: (p: object) => unknown };
  const renders = jest.fn();
  const original = svg.Path;
  svg.Path = (p: object) => { renders(); return (original as (p: object) => unknown)(p); };
  const frame = { value: 0 } as never;
  const { rerender } = await render(<FaceGraph trendPhotos={album} framePhotos={album} frame={frame} />);
  await fireEvent(screen.getByTestId('face-graph'), 'layout', { nativeEvent: { layout: { width: 300, height: 24 } } });
  const afterLayout = renders.mock.calls.length;
  await rerender(<FaceGraph trendPhotos={album} framePhotos={album} frame={frame} />);
  expect(renders.mock.calls.length).toBe(afterLayout);
  svg.Path = original;
});

describe('FaceGraph line', () => {
  const ph = (d: number, k = 1): TrendPhoto => ({ id: `q${d}`, date: iso(d), faceScan: { v: 2, eyes: null, width: 1, height: 1, measure: { ...base, jaw: 2 * k, lowJaw: 1.5 * k } } });
  const pathD = async (photos: TrendPhoto[]) => {
    await render(<FaceGraph trendPhotos={photos} framePhotos={photos} frame={{ value: 0 } as never} />);
    await fireEvent(screen.getByTestId('face-graph'), 'layout', { nativeEvent: { layout: { width: 300, height: 24 } } });
    return String(screen.getByTestId('face-graph-line').props.d);
  };

  it('breaks across a months-long gap between frames instead of joining them', async () => {
    const photos = [...Array.from({ length: 60 }, (_, d) => ph(d)), ...Array.from({ length: 60 }, (_, d) => ph(d + 150))];
    expect((await pathD(photos)).match(/M/g)).toHaveLength(2);
  });

  it('keeps a tiny wobble small instead of stretching it to the full height', async () => {
    const photos = Array.from({ length: 120 }, (_, d) => ph(d, d < 60 ? 1 : 1.002)); // 0.2% step
    const ys = (await pathD(photos)).match(/,(-?[\d.]+)/g)!.map((m) => Number(m.slice(1)));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3);
  });
});
