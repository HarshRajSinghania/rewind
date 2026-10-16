import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import ComparePane from '@/components/face/ComparePane';
import type { PhotoEntry } from '@/types';

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: (p: object) => <View testID="pane-image" {...p} /> };
});

const photo: PhotoEntry = {
  id: 'p', albumId: 'a', date: '2026-03-05', imageUri: 'file:///a.jpg', caption: '', capturedAt: '', cameraDirection: 'front',
  faceScan: { v: 2, eyes: { left: { x: 0.4, y: 0.3 }, right: { x: 0.6, y: 0.3 } }, width: 1000, height: 2000, measure: null },
};

it('eye-aligns the photo in its pane at the shared eye distance', async () => {
  await render(<ComparePane photo={photo} targetEyeDist={() => 60} />);
  await fireEvent(screen.getByTestId('compare-pane'), 'layout', { nativeEvent: { layout: { width: 150, height: 200 } } });
  const s = StyleSheet.flatten(screen.getByTestId('pane-image').props.style);
  // eyes 200 px apart -> scale 0.3; eye midpoint (500, 600)*0.3 lands on (75, 0.4*200).
  expect(s.width).toBeCloseTo(300, 6);
  expect(s.left).toBeCloseTo(75 - 150, 6);
  expect(s.top).toBeCloseTo(80 - 180, 6);
});
