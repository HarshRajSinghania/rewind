import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { scrollTo } from 'react-native-reanimated';
import Filmstrip from '@/components/timelapse/Filmstrip';
import type { PhotoEntry } from '@/types';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('@/components/ui/PhotoImage', () => {
  const { View } = require('react-native');
  return (props: { recyclingKey: string; contentPosition?: object }) => (
    <View testID={`thumb:${props.recyclingKey}`} contentPosition={props.contentPosition} />
  );
});

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

  it('crops a tall photo around the face', async () => {
    const photos = [{ ...PHOTOS[0], faceScan: { v: 1, eyes: { left: { x: 0.4, y: 0.4 }, right: { x: 0.6, y: 0.4 } }, width: 1000, height: 2000 } }];
    await render(<Filmstrip photos={photos} currentIndex={0} onSelect={jest.fn()} />);
    // 38x48 thumb: the photo is drawn 38 wide, 76 tall; face centre 0.45 * 76 = 34.2 -> (34.2 - 24) / 28.
    expect(screen.getByTestId('thumb:p-0').props.contentPosition).toEqual({ left: '50%', top: '36.4%' });
  });
});
