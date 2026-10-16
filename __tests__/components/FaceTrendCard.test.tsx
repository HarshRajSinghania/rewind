import { render, screen, fireEvent } from '@testing-library/react-native';
import FaceTrendCard from '@/components/face/FaceTrendCard';
import { FontProvider } from '@/context/FontContext';
import { buildFaceTrend, type TrendPhoto } from '@/utils/faceTrend';
import type { FaceMeasure } from '@/types';

jest.mock('react-native-svg', () => {
  const { View } = require('react-native');
  const Box = ({ children, ...p }: { children?: React.ReactNode }) => <View {...p}>{children}</View>;
  return { __esModule: true, default: Box, Svg: Box, Path: Box, Circle: Box, Line: Box };
});

const base: FaceMeasure = { ipd: 200, closeness: 0.2, jaw: 2, lowJaw: 1.5, cheek: 2.5, yaw: 0, pitch: 10, roll: 0, smile: 0, jawOpen: 0 };
const iso = (d: number) => new Date(Date.UTC(2025, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const photos = (n: number, k = 1): TrendPhoto[] =>
  Array.from({ length: n }, (_, d) => ({ id: `p${d}`, date: iso(d), faceScan: { v: 2, eyes: null, width: 1, height: 1, measure: { ...base, jaw: 2 * (d < n / 2 ? 1 : k), lowJaw: 1.5 * (d < n / 2 ? 1 : k) } } }));
const idle = { scanning: false, done: 0, total: 0 };

const renderCard = (p: TrendPhoto[], progress = idle, onSelectDate = jest.fn(), onCompare = jest.fn(), waiting = false) =>
  render(
    <FontProvider>
      <FaceTrendCard photos={p} trend={buildFaceTrend(p)} waiting={waiting} progress={progress} onSelectDate={onSelectDate} onCompare={onCompare} />
    </FontProvider>,
  );

it('says how many comparable photos it still needs instead of drawing a chart', async () => {
  await renderCard(photos(12));
  expect(screen.getByText('needs 30 comparable photos (12 so far)')).toBeTruthy();
  expect(screen.queryByTestId('face-chart')).toBeNull();
});

it('shows scan progress while measuring', async () => {
  await renderCard(photos(12), { scanning: true, done: 40, total: 482 });
  expect(screen.getByText('measuring 40/482')).toBeTruthy();
});

it('shows the headline and chart, and opens compare', async () => {
  const onCompare = jest.fn();
  await renderCard(photos(100, 0.96), idle, jest.fn(), onCompare);
  expect(screen.getByText(/lower face 4% thinner since/)).toBeTruthy();
  expect(screen.getByTestId('face-chart')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Compare two days' }));
  expect(onCompare).toHaveBeenCalled();
});

it('opens the photo nearest a tap on the chart', async () => {
  const onSelectDate = jest.fn();
  await renderCard(photos(100), idle, onSelectDate);
  const chart = screen.getByTestId('face-chart');
  await fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 300, height: 120 } } });
  await fireEvent.press(chart, { nativeEvent: { locationX: 0, locationY: 60 } });
  expect(onSelectDate).toHaveBeenCalledWith('2025-01-01');
});

it('says measuring is coming instead of "0 so far" while photos wait to be scanned', async () => {
  await renderCard([], idle, jest.fn(), jest.fn(), true);
  expect(screen.getByText('measuring soon')).toBeTruthy();
  expect(screen.queryByText(/so far/)).toBeNull();
});

it('draws all the daily dots as one path', async () => {
  await renderCard(photos(100));
  const chart = screen.getByTestId('face-chart');
  await fireEvent(chart, 'layout', { nativeEvent: { layout: { width: 300, height: 120 } } });
  expect(String(screen.getByTestId('face-chart-dots').props.d).match(/M/g)).toHaveLength(100);
});
