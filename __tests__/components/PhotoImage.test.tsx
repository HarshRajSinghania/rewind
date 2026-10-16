import { render, screen } from '@testing-library/react-native';
import PhotoImage from '@/components/ui/PhotoImage';

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: object) => React.createElement(View, { testID: 'image', ...props }) };
});
jest.mock('phosphor-react-native', () => ({ ImageBroken: () => null }));

describe('PhotoImage', () => {
  it('keeps local photos out of the disk cache', async () => {
    // Re-encoding already-local files into the disk cache is pure CPU waste.
    await render(<PhotoImage source={{ uri: 'file:///document/a.jpg' }} />);
    expect(screen.getByTestId('image').props.cachePolicy).toBe('memory');
  });

  it('keeps the disk cache for remote images', async () => {
    await render(<PhotoImage source={{ uri: 'https://example.com/a.jpg' }} />);
    expect(screen.getByTestId('image').props.cachePolicy).toBe('disk');
  });

  it('respects an explicit cache policy', async () => {
    await render(<PhotoImage source={{ uri: 'file:///document/a.jpg' }} cachePolicy="none" />);
    expect(screen.getByTestId('image').props.cachePolicy).toBe('none');
  });
});
