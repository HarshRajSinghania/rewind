import { SPEEDS, RING_SIZE, frameInterval, playbackStep, ringWindow } from '@/utils/playback';

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
  it('is the playhead and the frames after it', () => {
    expect(ringWindow(0, 482, RING_SIZE)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('wraps around the end of the timelapse', () => {
    expect(ringWindow(478, 482, 6)).toEqual([478, 479, 480, 481, 0, 1]);
  });

  it('never repeats a frame in a short album', () => {
    expect(ringWindow(1, 3, RING_SIZE)).toEqual([1, 2, 0]);
    expect(ringWindow(0, 0, RING_SIZE)).toEqual([]);
  });
});
