import { render, screen } from '@testing-library/react-native';
import CompareScreen from '@/app/album/compare';
import { FontProvider } from '@/context/FontContext';
import type { FaceMeasure, PhotoEntry } from '@/types';

let mockPhotos: PhotoEntry[] = [];
jest.mock('@/hooks/usePhotos', () => ({ usePhotos: () => ({ photos: mockPhotos }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ albumId: 'a' }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('phosphor-react-native', () => ({ CaretLeft: () => null }));
jest.mock('@/components/face/ComparePane', () => () => null);
jest.mock('@/components/timelapse/Scrubber', () => () => null);

const base: FaceMeasure = { ipd: 200, closeness: 0.2, jaw: 2, lowJaw: 1.5, cheek: 2.5, yaw: 0, pitch: 10, roll: 0, smile: 0, jawOpen: 0 };
const iso = (d: number) => new Date(Date.UTC(2025, 0, 1) + d * 86400000).toISOString().slice(0, 10);
const photo = (d: number, k: number): PhotoEntry => ({
  id: `p${d}`, albumId: 'a', date: iso(d), imageUri: `file:///${d}.jpg`, caption: '', capturedAt: '', cameraDirection: 'front',
  faceScan: { v: 2, eyes: { left: { x: 0.4, y: 0.3 }, right: { x: 0.6, y: 0.3 } }, width: 1000, height: 2000, measure: { ...base, jaw: 2 * k, lowJaw: 1.5 * k } },
});

const renderScreen = () => render(<FontProvider><CompareScreen /></FontProvider>);

it('says there is nothing to compare until enough photos are measured', async () => {
  mockPhotos = [photo(0, 1)];
  await renderScreen();
  expect(screen.getByText('not enough measured photos to compare yet')).toBeTruthy();
});

it('compares the first and last day by default', async () => {
  mockPhotos = Array.from({ length: 100 }, (_, d) => photo(d, d < 50 ? 1 : 0.96));
  await renderScreen();
  expect(screen.getByText(`${iso(99)} vs ${iso(0)}: trend -4.0% · photos -4.0%`)).toBeTruthy();
});
