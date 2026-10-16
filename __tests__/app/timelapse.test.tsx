import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import AlbumTimelapseScreen from '@/app/album/timelapse';
import { FontProvider } from '@/context/FontContext';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ albumId: 'a' }),
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true, replace: jest.fn() }),
  Stack: { Screen: () => null },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 40, bottom: 20, left: 0, right: 0 }), SafeAreaView: View };
});
jest.mock('@/context/AppContext', () => ({ useAppContext: () => ({ albums: [{ id: 'a', name: 'daily' }] }) }));
jest.mock('@/hooks/usePhotos', () => ({ usePhotos: () => ({ photos: [] }) }));
jest.mock('@/hooks/useTimelapse', () => ({
  useTimelapse: () => ({ filteredPhotos: [{}, {}], hasDateFilter: false }),
}));
jest.mock('@/components/timelapse/TimelapseView', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="timelapse-view" />, TimelapseEmpty: () => null };
});
jest.mock('@/components/timelapse/DateRangeSheet', () => () => null);
jest.mock('phosphor-react-native', () => ({ CaretLeft: () => null }));

it('pads for the status bar from the first frame, not after the slide-in settles', async () => {
  // The native SafeAreaView got its top inset only after the screen's slide-in finished,
  // so the header and the player jumped ~40dp once on open.
  await render(<FontProvider><AlbumTimelapseScreen /></FontProvider>);
  const root = screen.getByTestId('timelapse-screen-root');
  expect(StyleSheet.flatten(root.props.style)).toMatchObject({ paddingTop: 40, paddingBottom: 20 });
});
