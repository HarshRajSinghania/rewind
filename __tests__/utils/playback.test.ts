import { nextFrameDeadline } from '@/utils/playback';

describe('nextFrameDeadline', () => {
  it('keeps a fixed cadence: time spent in a tick comes out of the wait, not on top of it', () => {
    // Tick due at 125 ran its work until 155; the next stays due at 250 (wait 95, not 125).
    expect(nextFrameDeadline(125, 155, 125)).toBe(250);
  });

  it('does not burst to catch up after falling behind', () => {
    // A stall pushed us past the next deadline: show the next frame now, not several at once.
    expect(nextFrameDeadline(125, 400, 125)).toBe(400);
  });

  it('follows a speed change from the next tick', () => {
    expect(nextFrameDeadline(1000, 1010, 500)).toBe(1500);
  });
});
