import { renderHook } from '@testing-library/react-native';
import { useFaceDetection } from '@/hooks/useFaceDetection';

// Shared values are stable refs across renders in Reanimated; mirror that.
jest.mock('react-native-reanimated', () => {
  const { useRef } = require('react');
  return { useSharedValue: (v: unknown) => useRef({ value: v }).current };
});
// No native plugin under Jest -> the hook falls back to its no-op detector.
jest.mock('react-native-vision-camera', () => ({
  VisionCameraProxy: { initFrameProcessorPlugin: () => null },
}));
jest.mock('react-native-vision-camera-face-detector', () => ({ useFaceDetector: jest.fn() }));

describe('useFaceDetection', () => {
  it('returns the same sharedValues object on every render', async () => {
    // Viewfinder lists sharedValues as an effect dependency that calls back into the
    // camera screen's setState; a fresh object per render loops forever
    // ("Maximum update depth exceeded") whenever the face guide is off.
    const { result, rerender } = await renderHook(() => useFaceDetection());
    const first = result.current.sharedValues;
    await rerender({});
    expect(result.current.sharedValues).toBe(first);
    expect(result.current.isAvailable).toBe(false);
  });
});
