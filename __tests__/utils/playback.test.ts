import { SPEEDS, RING_AHEAD, RING_BEHIND, frameInterval, playbackStep, ringWindow } from '@/utils/playback';

describe('speeds', () => {
  it('offers 0.5x to 8x, where 1x is 2 photos a second', () => {
    expect([...SPEEDS]).toEqual([0.5, 1, 2, 4, 8]);
    expect(frameInterval(1)).toBe(500);
    expect(frameInterval(8)).toBe(62.5);
  });
});

describe('playbackStep', () => {
  it('holds until the frame is due', () => {
    expect(playbackStep(100, 125, 125, true)).toEqual({ advance: false, dueAt: 125 });
  });

  it('holds while the next frame is still loading, even when due', () => {
    expect(playbackStep(200, 125, 125, false)).toEqual({ advance: false, dueAt: 125 });
  });

  it('keeps a fixed cadence: a late frame does not push the schedule', () => {
    expect(playbackStep(130, 125, 125, true)).toEqual({ advance: true, dueAt: 250 });
  });

  it('does not burst to catch up after falling behind', () => {
    expect(playbackStep(400, 125, 125, true)).toEqual({ advance: true, dueAt: 400 });
  });
});

describe('ringWindow', () => {
  it('is the playhead, the frames after it, then the frames before it: the order to decode them in', () => {
    expect(ringWindow(100, 482, 2, 4)).toEqual([100, 101, 102, 103, 104, 99, 98]);
  });

  it('wraps around both ends of the timelapse', () => {
    expect(ringWindow(480, 482, 2, 3)).toEqual([480, 481, 0, 1, 479, 478]);
    expect(ringWindow(0, 482, 2, 1)).toEqual([0, 1, 481, 480]);
  });

  it('never repeats a frame in a short album', () => {
    expect(ringWindow(1, 3, RING_BEHIND, RING_AHEAD)).toEqual([1, 2, 0]);
    expect(ringWindow(0, 0, RING_BEHIND, RING_AHEAD)).toEqual([]);
  });

  it('decodes further ahead than behind, since playback runs forward', () => {
    expect(RING_AHEAD).toBeGreaterThan(RING_BEHIND);
    expect(RING_BEHIND).toBeGreaterThan(0);
  });
});
