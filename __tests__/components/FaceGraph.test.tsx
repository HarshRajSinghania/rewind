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
