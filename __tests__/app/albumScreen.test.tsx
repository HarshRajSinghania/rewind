import { render, screen } from '@testing-library/react-native';
import AlbumDetailScreen from '@/app/album/[id]';
import { FontProvider } from '@/context/FontContext';
import type { PhotoEntry } from '@/types';

let mockAvailable = true;
const mockCard = jest.fn();
const mockModal = jest.fn();
const photos: PhotoEntry[] = [{ id: 'p1', albumId: 'a', date: '2026-10-01', imageUri: 'file:///1.jpg', caption: '', capturedAt: '', cameraDirection: 'front' }];

jest.mock('@/utils/faceScan', () => ({ isFaceScanAvailable: () => mockAvailable, needsFaceScan: () => false }));
jest.mock('@/components/face/FaceTrendCard', () => (props: unknown) => { mockCard(props); return null; });
jest.mock('@/components/timeline/PhotoModal', () => (props: unknown) => { mockModal(props); return null; });
jest.mock('@/hooks/usePhotos', () => ({ usePhotos: () => ({ photos, getPhotosByMonth: () => photos }) }));
jest.mock('@/hooks/useStreak', () => ({ useStreak: () => ({ currentStreak: 1, consistency: 100 }) }));
jest.mock('@/hooks/useAlbumLock', () => ({ useAlbumLock: () => ({ isAlbumLocked: () => false, unlockAlbum: jest.fn() }) }));
jest.mock('@/hooks/usePhotoEncodeBackfill', () => ({ usePhotoEncodeBackfill: () => ({ encoding: false, done: 0, total: 0, pending: false }) }));
jest.mock('@/hooks/useFaceScanBackfill', () => ({ useFaceScanBackfill: () => ({ scanning: false, done: 0, total: 0 }) }));
jest.mock('@/context/AppContext', () => ({
  useAppContext: () => ({
    profile: { joinDate: '2026-01-01' }, albums: [{ id: 'a', name: 'daily', createdAt: '2026-01-01' }],
    addPhoto: jest.fn(), updatePhoto: jest.fn(), deletePhoto: jest.fn(), updateProfile: jest.fn(), updateAlbum: jest.fn(), deleteAlbum: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'a' }), useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useIsFocused: () => true, Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('phosphor-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/components/ui/MonthPicker', () => () => null);
jest.mock('@/components/ui/PinModal', () => () => null);
jest.mock('@/components/ui/ImportSheet', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/timeline/MonthHeader', () => () => null);
jest.mock('@/components/timeline/CalendarStats', () => () => null);
jest.mock('@/components/timeline/CalendarGrid', () => () => null);
jest.mock('@/components/ui/EmptyState', () => () => null);
jest.mock('@/utils/import', () => ({ pickPhotosFromLibrary: jest.fn() }));

const renderScreen = () => render(<FontProvider><AlbumDetailScreen /></FontProvider>);

beforeEach(() => jest.clearAllMocks());

it('shows the face card and the photo readout when the face scanner is available', async () => {
  mockAvailable = true;
  await renderScreen();
  expect(mockCard).toHaveBeenCalled();
  expect(typeof (mockModal.mock.calls.at(-1)?.[0] as { readout?: unknown }).readout).toBe('function');
});

it('hides the face card and the readout without the face scanner (Expo Go, unbuilt iOS)', async () => {
  mockAvailable = false;
  await renderScreen();
  expect(mockCard).not.toHaveBeenCalled();
  expect((mockModal.mock.calls.at(-1)?.[0] as { readout?: unknown }).readout).toBeUndefined();
});
