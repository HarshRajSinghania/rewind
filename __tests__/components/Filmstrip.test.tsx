import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { scrollTo } from 'react-native-reanimated';
import Filmstrip from '@/components/timelapse/Filmstrip';
import type { PhotoEntry } from '@/types';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('@/components/ui/PhotoImage', () => () => null);

const PHOTOS: PhotoEntry[] = Array.from({ length: 6 }, (_, i) => ({
  id: `p-${i}`, albumId: 'a1', date: `2026-03-0${i + 1}`, imageUri: `file:///${i}.jpg`,
  caption: '', capturedAt: '', cameraDirection: 'front',
}));

describe('Filmstrip', () => {
  it('highlights and scrolls to the frame on screen, straight from the shared frame', async () => {
    await render(<Filmstrip photos={PHOTOS} currentIndex={0} onSelect={jest.fn()} frame={{ value: 3 } as never} />);
    const opacity = (i: number) => StyleSheet.flatten(screen.getByTestId(`filmstrip-thumb-${i}`).props.style).opacity;
    expect(opacity(3)).toBe(1);
    expect(opacity(0)).toBe(0.4);
    expect(scrollTo).toHaveBeenCalledWith(expect.anything(), 3 * 42 + 21, 0, false);
  });
});
