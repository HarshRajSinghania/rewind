/** Minimal Reanimated stand-in: shared values are refs, animated styles evaluate at
 *  render, and frame callbacks are captured so tests can tick the UI-thread clock. */
import React from 'react';
import { View } from 'react-native';

export type FrameInfo = { timestamp: number };
export type TestClock = { tick: (info: FrameInfo) => void; active: boolean; setActive: (active: boolean) => void };
export const frameClocks: TestClock[] = [];

export const reanimatedMock = {
  __esModule: true,
  default: { View },
  useSharedValue<T>(initial: T) {
    return React.useRef({ value: initial }).current;
  },
  useAnimatedStyle(updater: () => object) {
    return updater();
  },
  useFrameCallback(callback: (info: FrameInfo) => void) {
    const ref = React.useRef<TestClock | null>(null);
    if (!ref.current) {
      const clock: TestClock = {
        tick: callback,
        active: false,
        setActive: (active: boolean) => { clock.active = active; },
      };
      ref.current = clock;
      frameClocks.push(clock);
    }
    ref.current.tick = callback;
    return ref.current;
  },
};
