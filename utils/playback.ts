/**
 * Timelapse playback timing, shared by the UI-thread clock (worklets) and JS.
 * 1x is 2 photos a second; 15x is ~30.
 */

export const SPEEDS = [0.5, 1, 2, 4, 8, 15] as const;

/** Frames mounted ahead of the playhead so the next ones are already decoded. */
export const RING_SIZE = 12;

export function frameInterval(speed: number): number {
  'worklet';
  return 500 / speed;
}

export interface PlaybackStep {
  advance: boolean;
  dueAt: number;
}

/**
 * One display-frame step of the playback clock. Advance only when the frame is due
 * and the next one has loaded (otherwise hold — never show a blank). Fixed cadence:
 * a late frame doesn't push the schedule, and falling behind never bursts to catch up.
 */
export function playbackStep(now: number, dueAt: number, interval: number, nextLoaded: boolean): PlaybackStep {
  'worklet';
  if (now < dueAt || !nextLoaded) return { advance: false, dueAt };
  const next = dueAt + interval;
  return { advance: true, dueAt: next < now ? now : next };
}

/** The playhead and the frames after it (wrapping), at most `size`, without repeats. */
export function ringWindow(index: number, length: number, size: number): number[] {
  const count = Math.min(size, length);
  const frames: number[] = [];
  for (let k = 0; k < count; k++) frames.push((index + k) % length);
  return frames;
}

/**
 * JS-timer deadline used by the current player until the UI-thread clock replaces it.
 * If we've already fallen past the next deadline, the next frame is due now.
 */
export function nextFrameDeadline(prevDeadline: number, now: number, interval: number): number {
  const next = prevDeadline + interval;
  return next < now ? now : next;
}
