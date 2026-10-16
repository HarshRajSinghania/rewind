import { previewMirroring, frameToView, uprightFrameSize } from '@/utils/cameraPreview';

describe('previewMirroring', () => {
  it('leaves the native mirrored selfie preview alone when selfies are saved mirrored', () => {
    expect(previewMirroring('front', true)).toEqual({ flipPreview: false, shownMirrored: true });
  });

  it('flips the selfie preview back when selfies are saved unmirrored', () => {
    expect(previewMirroring('front', false)).toEqual({ flipPreview: true, shownMirrored: false });
  });

  it('never mirrors the back camera', () => {
    expect(previewMirroring('back', true)).toEqual({ flipPreview: false, shownMirrored: false });
    expect(previewMirroring('back', false)).toEqual({ flipPreview: false, shownMirrored: false });
  });
});

describe('frameToView', () => {
  it('passes points through when the frame and the view have the same shape', () => {
    const m = frameToView({ w: 480, h: 640 }, { w: 300, h: 400 }, false);
    expect(m.x(0.25)).toBeCloseTo(0.25, 10);
    expect(m.y(0.75)).toBeCloseTo(0.75, 10);
    expect(m.scaleX).toBeCloseTo(1, 10);
  });

  it('follows the cover crop when the view is taller than the frame', () => {
    // 3:4 frame filling a 300x500 view is drawn 375 wide, 37.5 cut off each side.
    const m = frameToView({ w: 480, h: 640 }, { w: 300, h: 500 }, false);
    expect(m.x(0.1)).toBeCloseTo(0, 10);
    expect(m.x(0.5)).toBeCloseTo(0.5, 10);
    expect(m.y(0.2)).toBeCloseTo(0.2, 10);
    expect(m.scaleX).toBeCloseTo(1.25, 10);
  });

  it('mirrors x for a mirrored preview', () => {
    const m = frameToView({ w: 480, h: 640 }, { w: 300, h: 500 }, true);
    expect(m.x(0.1)).toBeCloseTo(1, 10);
    expect(m.x(0.3)).toBeCloseTo(1 - (0.3 * 375 - 37.5) / 300, 10);
  });

  it('leaves points alone until both sizes are known', () => {
    const m = frameToView({ w: 480, h: 640 }, { w: 0, h: 0 }, false);
    expect(m.x(0.3)).toBe(0.3);
    expect(m.y(0.3)).toBe(0.3);
  });
});

describe('uprightFrameSize', () => {
  it('swaps a sideways sensor buffer to the upright image the detector reports in', () => {
    // Android hands a 640x480 buffer rotated 90/270 degrees; MLKit answers in 480x640.
    expect(uprightFrameSize(640, 480, 'landscape-left')).toEqual({ w: 480, h: 640 });
    expect(uprightFrameSize(640, 480, 'landscape-right')).toEqual({ w: 480, h: 640 });
  });

  it('keeps an already upright buffer', () => {
    expect(uprightFrameSize(480, 640, 'portrait')).toEqual({ w: 480, h: 640 });
    expect(uprightFrameSize(480, 640, 'portrait-upside-down')).toEqual({ w: 480, h: 640 });
  });
});
