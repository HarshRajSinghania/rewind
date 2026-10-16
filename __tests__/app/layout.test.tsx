import { render, screen } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

jest.mock('expo-font', () => ({ useFonts: () => [true] }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
jest.mock('expo-router', () => ({ Stack: () => null }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View };
});
jest.mock('react-native-safe-area-context', () => ({ SafeAreaProvider: ({ children }: { children: unknown }) => children }));
jest.mock('@/context/AppContext', () => ({
  AppProvider: () => {
    throw new Error('storage exploded');
  },
}));

it('shows the error screen, not a blank app, when a provider throws', async () => {
  // A blank app after unlock was seen once: an error above the old boundary (inside the
  // providers) unmounts everything. The boundary now wraps the providers too.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await render(<RootLayout />);
  expect(screen.getByText('Something went wrong')).toBeTruthy();
});
