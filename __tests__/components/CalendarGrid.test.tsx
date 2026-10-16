import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import CalendarGrid from '@/components/timeline/CalendarGrid';
import { FontProvider } from '@/context/FontContext';
import type { PhotoEntry } from '@/types';

jest.mock('@/components/ui/PhotoImage', () => {
  const { View } = require('react-native');
  return (props: { source: { uri: string }; contentPosition?: object }) => (
    <View testID={`thumb:${props.source.uri}`} contentPosition={props.contentPosition} />
  );
});

function photo(date: string): PhotoEntry {
  return {
    id: `p-${date}`, albumId: 'a1', date, imageUri: `file:///document/${date}.jpg`,
    caption: '', capturedAt: `${date}T12:00:00.000Z`, cameraDirection: 'front',
  };
}

describe('CalendarGrid', () => {
  it('shows a photo even when its day is before the given start date', async () => {
    // Imported history predates the album; a captured day must never render as "before the album".
    await render(
      <FontProvider>
        <CalendarGrid year={2026} month={3} photos={[photo('2026-03-05')]} joinDate="2026-03-20" onDayPress={jest.fn()} />
      </FontProvider>,
    );
    expect(screen.getByTestId('thumb:file:///document/2026-03-05.jpg')).toBeTruthy();
  });

  it('crops a tall photo around the face, not the middle', async () => {
    const tall = {
      ...photo('2026-03-05'),
      faceScan: { v: 1, eyes: { left: { x: 0.4, y: 0.4 }, right: { x: 0.6, y: 0.4 } }, width: 1000, height: 2000 },
    };
    await render(
      <FontProvider>
        <CalendarGrid year={2026} month={3} photos={[tall]} joinDate="2026-03-01" onDayPress={jest.fn()} />
      </FontProvider>,
    );
    expect(screen.getByTestId('thumb:file:///document/2026-03-05.jpg').props.contentPosition).toEqual({ left: '50%', top: '40%' });
  });

  it("draws a missed day's border inside the cell, so it sizes like the photo next to it", async () => {
    // Yoga floors a flex item's base size at its own border: with the border on the cell,
    // a missed day came out 2dp wider (and, square, taller) than its neighbours.
    await render(
      <FontProvider>
        <CalendarGrid year={2026} month={3} photos={[photo('2026-03-05')]} joinDate="2026-03-01" onDayPress={jest.fn()} onEmptyDayPress={jest.fn()} />
      </FontProvider>,
    );
    const cell = StyleSheet.flatten(screen.getByTestId('missed-2026-03-04').props.style);
    expect(cell.borderWidth ?? 0).toBe(0);
    expect(StyleSheet.flatten(screen.getByTestId('missed-border-2026-03-04').props.style).borderWidth).toBe(1);
  });
});
