/**
 * Timelapse playback timing, shared by the UI-thread clock (worklets) and JS.
 * 1x is 2 photos a second; 8x is 16.
 */

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;

/**
 * Frames kept mounted (decoded) around the playhead. Ahead covers playback, which only
 * runs forward; behind keeps a skip or scrub back from waiting on a decode.
 */
export const RING_AHEAD = 15;
export const RING_BEHIND = 5;

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

/**
 * The playhead, up to `ahead` frames after it, then up to `behind` before it (wrapping,
 * no repeats). Ordered nearest-ahead first: frames mount, and so start decoding, in
 * this order.
 */
export function ringWindow(index: number, length: number, behind: number, ahead: number): number[] {
  if (length === 0) return [];
  const frames = new Set<number>();
  for (let k = 0; k <= ahead && frames.size < length; k++) frames.add((index + k) % length);
  for (let k = 1; k <= behind && frames.size < length; k++) frames.add((((index - k) % length) + length) % length);
  return [...frames];
}

