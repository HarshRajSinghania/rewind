import { renderHook, act } from '@testing-library/react-native';
import { useAutoCapture } from '@/hooks/useAutoCapture';

// NOTE: @testing-library/react-native v14 renderHook/rerender are async.
async function setup(overrides: Partial<Parameters<typeof useAutoCapture>[0]> = {}) {
  const onCapture = jest.fn();
  const utils = await renderHook(
    ({ score, enabled }: { score: number; enabled: boolean }) =>
      useAutoCapture({
        enabled,
        alignmentScore: score,
        alignmentThreshold: 0.7,
        requiredFrames: 5,
        cooldownMs: 2000,
        onCapture,
        ...overrides,
      }),
    { initialProps: { score: 0, enabled: true } }
  );
  return { ...utils, onCapture };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAutoCapture', () => {
  it('fires onCapture after enough aligned frames, then cools down', async () => {
    const { result, rerender, onCapture } = await setup();

    // Each render with a (distinct) aligned score adds one stable frame
    for (let i = 1; i <= 5; i++) {
      await rerender({ score: 0.8 + i * 0.01, enabled: true });
    }

    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(result.current.isInCooldown).toBe(true);
    expect(result.current.progress).toBe(0);

    // Still cooling down: aligned frames do not refire
    await rerender({ score: 0.95, enabled: true });
    expect(onCapture).toHaveBeenCalledTimes(1);

    // Cooldown expires → capture can fire again
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.isInCooldown).toBe(false);
  });

  it('reports progress as stableFrames / requiredFrames', async () => {
    const { result, rerender } = await setup();
    await rerender({ score: 0.8, enabled: true });
    await rerender({ score: 0.81, enabled: true });
    expect(result.current.stableFrames).toBe(2);
    expect(result.current.progress).toBeCloseTo(0.4);
  });

  it('decays stable frames after sustained misalignment', async () => {
    const { result, rerender } = await setup();
    await rerender({ score: 0.8, enabled: true });
    await rerender({ score: 0.81, enabled: true });
    expect(result.current.stableFrames).toBe(2);

    await rerender({ score: 0.1, enabled: true });
    // Hold window (500ms) not yet elapsed
    await act(async () => {
      jest.advanceTimersByTime(499);
    });
    expect(result.current.stableFrames).toBe(2);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.stableFrames).toBe(0);
    expect(result.current.progress).toBe(0);
  });

  it('does nothing while disabled', async () => {
    const { result, rerender, onCapture } = await setup();
    for (let i = 0; i < 10; i++) {
      await rerender({ score: 0.9, enabled: false });
    }
    expect(onCapture).not.toHaveBeenCalled();
    expect(result.current.stableFrames).toBe(0);
  });

  it('ignores below-threshold scores', async () => {
    const { result, rerender, onCapture } = await setup();
    for (let i = 0; i < 10; i++) {
      await rerender({ score: 0.69, enabled: true });
    }
    expect(onCapture).not.toHaveBeenCalled();
    expect(result.current.stableFrames).toBe(0);
  });
});
