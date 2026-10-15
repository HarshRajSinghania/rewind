/**
 * Timelapse playback timing. A plain setTimeout(interval) chain drifts: each tick's
 * render work lands on top of the wait (measured on device at 4x: 137ms per frame
 * instead of 125ms). Scheduling against fixed deadlines keeps the cadence.
 */

/**
 * When the next frame is due, given when the last one was due, the time now (after
 * this tick's work), and the frame interval. If we've already fallen past it, the next
 * frame is due now — never a burst of catch-up frames.
 */
export function nextFrameDeadline(prevDeadline: number, now: number, interval: number): number {
  const next = prevDeadline + interval;
  return next < now ? now : next;
}
