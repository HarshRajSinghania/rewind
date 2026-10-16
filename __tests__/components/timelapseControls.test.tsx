import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import AlignToggle from '@/components/timelapse/AlignToggle';
import SpeedSelector from '@/components/timelapse/SpeedSelector';
import { FontProvider } from '@/context/FontContext';

jest.mock('phosphor-react-native', () => ({ UserFocus: () => null }));

describe('AlignToggle', () => {
  it('announces itself as a checked switch and turns off on press', async () => {
    const onToggle = jest.fn();
    await render(<AlignToggle enabled onToggle={onToggle} />);
    const toggle = screen.getByRole('switch', { name: 'align faces' });
    expect(toggle).toBeChecked();
    await fireEvent.press(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('turns on from off', async () => {
    const onToggle = jest.fn();
    await render(<AlignToggle enabled={false} onToggle={onToggle} />);
    const toggle = screen.getByRole('switch', { name: 'align faces' });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('SpeedSelector', () => {
  it('renders a trailing control at the end of the row', async () => {
    await render(
      <FontProvider>
        <SpeedSelector selectedSpeed={1} onSelect={jest.fn()} trailing={<Text>tail</Text>} />
      </FontProvider>,
    );
    expect(screen.getByText('4x')).toBeTruthy();
    expect(screen.getByText('tail')).toBeTruthy();
  });

  it('offers 0.5x to 15x and selects the fast ones', async () => {
    const onSelect = jest.fn();
    await render(
      <FontProvider>
        <SpeedSelector selectedSpeed={1} onSelect={onSelect} />
      </FontProvider>,
    );
    for (const label of ['0.5x', '1x', '2x', '4x', '8x', '15x']) expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByText('15x'));
    expect(onSelect).toHaveBeenCalledWith(15);
  });
});
