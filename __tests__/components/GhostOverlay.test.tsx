import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import GhostOverlay from '@/components/camera/GhostOverlay';
import { FontProvider } from '@/context/FontContext';
import type { GhostPlacement } from '@/utils/ghost';

jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Image: (props: object) => React.createElement(View, { testID: 'ghost-image', ...props }) };
});
jest.mock('phosphor-react-native', () => ({ Stack: () => null }));
jest.mock('@/components/ui/OpacitySlider', () => () => null);

const PLACEMENT: GhostPlacement = {
  layout: { width: 600, height: 1200, left: -150, top: -40, transformOrigin: [300, 200, 0], rotation: 0.1 },
  eyes: { x: 0.5, y: 0.4, dist: 0.2 },
};

async function renderGhost(placement: GhostPlacement | null, flip = false) {
  await render(
    <FontProvider>
      <GhostOverlay imageUri="file:///y.jpg" opacity={0.3} onOpacityChange={jest.fn()} placement={placement} flip={flip} />
    </FontProvider>,
  );
  const image = screen.getByTestId('ghost-image');
  return { image, style: StyleSheet.flatten(image.props.style), frame: StyleSheet.flatten(screen.getByTestId('ghost').props.style) };
}

describe('GhostOverlay', () => {
  it("draws yesterday's photo at its eye-anchored layout", async () => {
    const { image, style } = await renderGhost(PLACEMENT);
    expect(image.props.contentFit).toBe('fill');
    expect(style).toMatchObject({ position: 'absolute', left: -150, top: -40, width: 600, height: 1200, opacity: 0.3 });
    expect(style.transformOrigin).toEqual([300, 200, 0]);
    expect(style.transform).toEqual([{ rotate: '0.1rad' }]);
  });

  it('falls back to a plain cover fit without a placement', async () => {
    const { image, style } = await renderGhost(null);
    expect(image.props.contentFit).toBe('cover');
    expect(style).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('mirrors the photo when it was saved with the other mirroring', async () => {
    expect((await renderGhost(PLACEMENT, true)).frame.transform).toEqual([{ scaleX: -1 }]);
  });

  it('keeps local photos out of the disk cache', async () => {
    expect((await renderGhost(PLACEMENT)).image.props.cachePolicy).toBe('memory');
  });
});
