import { render, screen } from '@testing-library/react-native';
import Scrubber from '@/components/timelapse/Scrubber';
import { FontProvider } from '@/context/FontContext';

jest.mock('react-native-reanimated', () => require('../helpers/reanimatedMock').reanimatedMock);
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
jest.mock('react-native-gesture-handler', () => {
  const chain = (): unknown => new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => chain()) });
  return { GestureDetector: ({ children }: { children: unknown }) => children, Gesture: { Pan: chain, Tap: chain, Race: () => ({}) } };
});

describe('Scrubber', () => {
  it('shows the counter for the frame on screen, straight from the shared frame', async () => {
    // JS state lagged the picture (~10 updates/s); the counter must match every frame.
    await render(
      <FontProvider>
        <Scrubber currentIndex={0} total={10} startDate="2026-03-01" endDate="2026-03-10" onSeek={jest.fn()} frame={{ value: 5 } as never} />
      </FontProvider>,
    );
    expect(screen.getByTestId('scrubber-counter').props.text).toBe('6 / 10');
  });
});

describe('Scrubber drag reporting', () => {
  it('reports when a drag starts and ends, so the player can decode just the frame under the finger', async () => {
    const pan: Record<string, (e?: { x: number }) => void> = {};
    const gh = jest.requireMock('react-native-gesture-handler') as { Gesture: { Pan: () => unknown } };
    const original = gh.Gesture.Pan;
    gh.Gesture.Pan = () => {
      const g: unknown = new Proxy({}, {
        get: (_t, prop) => (prop === 'then' ? undefined : (fn: unknown) => {
          if (typeof fn === 'function') pan[String(prop)] = fn as (e?: { x: number }) => void;
          return g;
        }),
      });
      return g;
    };
    const onScrubChange = jest.fn();
    await render(
      <FontProvider>
        <Scrubber currentIndex={0} total={10} startDate="2026-03-01" endDate="2026-03-10" onSeek={jest.fn()} onScrubChange={onScrubChange} />
      </FontProvider>,
    );
    gh.Gesture.Pan = original;
    pan.onBegin({ x: 0 });
    expect(onScrubChange).toHaveBeenLastCalledWith(true);
    pan.onFinalize();
    expect(onScrubChange).toHaveBeenLastCalledWith(false);
  });
});
