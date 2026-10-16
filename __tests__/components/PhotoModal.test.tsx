import { render, screen } from '@testing-library/react-native';
import PhotoModal from '@/components/timeline/PhotoModal';
import { FontProvider } from '@/context/FontContext';
import type { PhotoEntry } from '@/types';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('@/components/ui/PhotoImage', () => () => null);
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const chain = (): unknown => new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => chain()) });
  return {
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: View,
    Gesture: { Pan: chain, Pinch: chain, Tap: chain, Simultaneous: chain, Exclusive: chain, Race: chain },
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('phosphor-react-native', () => new Proxy({}, { get: () => () => null }));

const photo: PhotoEntry = { id: 'p1', albumId: 'a', date: '2026-03-05', imageUri: 'file:///a.jpg', caption: '', capturedAt: '2026-03-05T12:00:00.000Z', cameraDirection: 'front' };

it('shows the face readout for the photo on screen', async () => {
  await render(
    <FontProvider>
      <PhotoModal visible photos={[photo]} initialIndex={0} joinDate="2026-01-01" onClose={jest.fn()} onDelete={jest.fn()} onUpdateCaption={jest.fn()}
        readout={(p) => (p.id === 'p1' ? 'face 2% fuller than your 30-day average' : null)} />
    </FontProvider>,
  );
  expect(screen.getByText('face 2% fuller than your 30-day average')).toBeTruthy();
});
