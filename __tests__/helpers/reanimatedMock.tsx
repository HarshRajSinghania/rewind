/** Reanimated stand-in with the device's threading semantics where they matter:
 *  - a JS write to a shared value lands on the UI copy only when the UI thread next runs
 *    (a frame-callback tick or a render of an animated style);
 *  - a JS read returns the UI copy (so read-modify-write from JS can lose updates);
 *  - writes made inside a frame callback (the UI thread) apply immediately.
 *  Frame callbacks are captured so tests can tick the UI-thread clock. */
import React from 'react';
import { View, FlatList } from 'react-native';

export type FrameInfo = { timestamp: number };
export type TestClock = { tick: (info: FrameInfo) => void; active: boolean; setActive: (active: boolean) => void };
export const frameClocks: TestClock[] = [];

let pendingUiWrites: (() => void)[] = [];
let onUiThread = false;

/** Apply queued JS -> UI writes, as the UI thread does before its next frame. */
export function flushUiWrites(): void {
  const writes = pendingUiWrites;
  pendingUiWrites = [];
  writes.forEach((write) => write());
}

function makeShared<T>(initial: T) {
  let ui = initial;
  return {
    get value() {
      return ui;
    },
    set value(next: T) {
      if (onUiThread) ui = next;
      else pendingUiWrites.push(() => { ui = next; });
    },
  };
}

export const reanimatedMock = {
  __esModule: true,
  default: { View, FlatList } as Record<string, unknown>,
  useSharedValue<T>(initial: T) {
    const ref = React.useRef<ReturnType<typeof makeShared<T>> | null>(null);
    if (!ref.current) ref.current = makeShared(initial);
    return ref.current;
  },
  useAnimatedStyle(updater: () => object) {
    flushUiWrites();
    return updater();
  },
  useAnimatedProps(updater: () => object) {
    flushUiWrites();
    return updater();
  },
  useDerivedValue<T>(compute: () => T) {
    flushUiWrites();
    return { value: compute() };
  },
  /** Runs the reaction at render with the current value (the UI thread would run it on change). */
  useAnimatedReaction<T>(prepare: () => T, react: (current: T, previous: T | null) => void) {
    flushUiWrites();
    react(prepare(), null);
  },
  useAnimatedRef<T>() {
    return React.useRef<T | null>(null);
  },
  scrollTo: jest.fn(),
  createAnimatedComponent<P extends object>(Component: React.ComponentType<P>) {
    // Animated props arrive via `animatedProps`; merge them so tests can read them.
    return (props: P & { animatedProps?: object }) => {
      const { animatedProps, ...rest } = props;
      return React.createElement(Component, { ...(rest as P), ...(animatedProps ?? {}) });
    };
  },
  useFrameCallback(callback: (info: FrameInfo) => void) {
    const ref = React.useRef<TestClock | null>(null);
    const latest = React.useRef(callback);
    latest.current = callback;
    if (!ref.current) {
      const clock: TestClock = {
        tick: (info) => {
          flushUiWrites();
          onUiThread = true;
          try { latest.current(info); } finally { onUiThread = false; }
        },
        active: false,
        setActive: (active: boolean) => { clock.active = active; },
      };
      ref.current = clock;
      frameClocks.push(clock);
    }
    return ref.current;
  },
};

reanimatedMock.default.createAnimatedComponent = reanimatedMock.createAnimatedComponent;
