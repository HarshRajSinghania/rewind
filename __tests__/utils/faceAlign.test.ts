import {
  computeFaceTransform,
  medianEyeDistance,
  faceContentPosition,
  EYE_ANCHOR_Y,
  MAX_ZOOM_OVER_COVER,
  type FaceFrameLayout,
} from '@/utils/faceAlign';
import type { FaceScan } from '@/types';
// The same parser RN applies to the style prop on device.
import processTransformOrigin from 'react-native/Libraries/StyleSheet/processTransformOrigin';

const BOX = { w: 300, h: 400 };
const ANCHOR = { x: BOX.w / 2, y: EYE_ANCHOR_Y * BOX.h }; // (150, 160)

function scan(left: [number, number], right: [number, number], width = 1000, height = 1000): FaceScan {
  return { v: 1, eyes: { left: { x: left[0], y: left[1] }, right: { x: right[0], y: right[1] } }, width, height };
}

/** Where a normalized image point lands on screen: absolute layout, then rotation about transformOrigin. */
function project(layout: FaceFrameLayout, s: FaceScan, p: { x: number; y: number }) {
  const k = layout.width / s.width;
  const x = layout.left + p.x * s.width * k;
  const y = layout.top + p.y * s.height * k;
  const [ox, oy] = layout.transformOrigin;
  const cx = layout.left + ox;
  const cy = layout.top + oy;
  const cos = Math.cos(layout.rotation);
  const sin = Math.sin(layout.rotation);
  return { x: cx + (x - cx) * cos - (y - cy) * sin, y: cy + (x - cx) * sin + (y - cy) * cos };
}

function expectEyesLocked(s: FaceScan, targetDist: number): FaceFrameLayout {
  const layout = computeFaceTransform(s, BOX, targetDist);
  expect(layout).not.toBeNull();
  const a = project(layout!, s, s.eyes!.left);
  const b = project(layout!, s, s.eyes!.right);
  const [l, r] = a.x <= b.x ? [a, b] : [b, a];
  expect(l.y).toBeCloseTo(ANCHOR.y, 6);
  expect(r.y).toBeCloseTo(ANCHOR.y, 6);
  expect(l.x).toBeCloseTo(ANCHOR.x - targetDist / 2, 6);
  expect(r.x).toBeCloseTo(ANCHOR.x + targetDist / 2, 6);
  return layout!;
}

describe('computeFaceTransform', () => {
  it('puts level eyes on the anchor at the target distance', () => {
    const layout = expectEyesLocked(scan([0.4, 0.5], [0.6, 0.5]), 60);
    expect(layout.rotation).toBeCloseTo(0, 10);
  });

  it('levels a tilted head', () => {
    const layout = expectEyesLocked(scan([0.4, 0.45], [0.6, 0.55]), 60);
    expect(layout.rotation).toBeCloseTo(-Math.atan2(100, 200), 10);
  });

  it('ignores swapped eye labels from a mirrored file', () => {
    const a = computeFaceTransform(scan([0.4, 0.45], [0.6, 0.55]), BOX, 60);
    const b = computeFaceTransform(scan([0.6, 0.55], [0.4, 0.45]), BOX, 60);
    expect(b).toEqual(a);
  });

  it('locks eyes in a landscape photo', () => {
    expectEyesLocked(scan([0.45, 0.4], [0.55, 0.42], 1600, 900), 60);
  });

  it('caps zoom for a far-away face but keeps it centered on the eyes', () => {
    // Eye distance 20px of a 1000px image; target 60 would need 3x, cap is 3 * cover(0.4) = 1.2x.
    const s = scan([0.49, 0.5], [0.51, 0.5]);
    const layout = computeFaceTransform(s, BOX, 60)!;
    const cover = Math.max(BOX.w / 1000, BOX.h / 1000);
    expect(layout.width).toBeCloseTo(1000 * MAX_ZOOM_OVER_COVER * cover, 6);
    const mid = project(layout, s, { x: 0.5, y: 0.5 });
    expect(mid.x).toBeCloseTo(ANCHOR.x, 6);
    expect(mid.y).toBeCloseTo(ANCHOR.y, 6);
  });

  it('gives a transformOrigin React Native accepts for fractional pivots', () => {
    // RN's string parser only takes integer px ("150.77px" splits into bogus parts and
    // throws "Transform origin must have exactly 3 values" on device); real pivots are
    // fractional, so the origin must be the exact [x, y, z] array form.
    const layout = computeFaceTransform(scan([0.4013, 0.4883], [0.5889, 0.509], 1024, 1365), BOX, 57.73)!;
    expect(() => processTransformOrigin(layout.transformOrigin)).not.toThrow();
    expect(processTransformOrigin(layout.transformOrigin)).toEqual(layout.transformOrigin);
  });

  it('returns null when it cannot align', () => {
    const level = scan([0.4, 0.5], [0.6, 0.5]);
    expect(computeFaceTransform({ ...level, eyes: null }, BOX, 60)).toBeNull();
    expect(computeFaceTransform(scan([0.5, 0.5], [0.5, 0.5]), BOX, 60)).toBeNull();
    expect(computeFaceTransform(level, { w: 0, h: 400 }, 60)).toBeNull();
    expect(computeFaceTransform(level, BOX, 0)).toBeNull();
    expect(computeFaceTransform({ ...level, width: 0 }, BOX, 60)).toBeNull();
  });
});

describe('medianEyeDistance', () => {
  // 1000x1000 scans in a 300x400 box: cover scale 0.4, so 0.1/0.2/0.3 eye gaps -> 40/80/120px.
  const gap = (d: number) => scan([0.5 - d / 2, 0.5], [0.5 + d / 2, 0.5]);

  it('takes the median cover-fit eye distance, skipping frames without eyes', () => {
    const noFace: FaceScan = { v: 1, eyes: null, width: 1000, height: 1000 };
    expect(medianEyeDistance([gap(0.3), undefined, gap(0.1), noFace, gap(0.2)], BOX)).toBeCloseTo(80, 6);
  });

  it('averages the middle pair for an even count', () => {
    expect(medianEyeDistance([gap(0.1), gap(0.2)], BOX)).toBeCloseTo(60, 6);
  });

  it('returns null with fewer than two faces or no container', () => {
    expect(medianEyeDistance([gap(0.2), undefined], BOX)).toBeNull();
    expect(medianEyeDistance([gap(0.1), gap(0.2)], { w: 0, h: 0 })).toBeNull();
  });
});

describe('faceContentPosition', () => {
  const tall = (eyeY: number) => scan([0.4, eyeY], [0.6, eyeY], 1000, 2000);

  it('slides a cover crop down a tall photo to the face', () => {
    // Square box: the photo is cropped to its middle half by height. Eyes 40% down,
    // 200 px apart: the face centre (100 px below the eyes) is 45% down the photo.
    // (0.45 * 200 - 50) / (200 - 100) = 40%.
    expect(faceContentPosition(tall(0.4), { w: 100, h: 100 })).toEqual({ left: '50%', top: '40%' });
  });

  it('pins the crop to the edge when the face is near it', () => {
    expect(faceContentPosition(tall(0.05), { w: 100, h: 100 })!.top).toBe('0%');
    expect(faceContentPosition(tall(0.95), { w: 100, h: 100 })!.top).toBe('100%');
  });

  it('works sideways for a wide photo in a tall box', () => {
    const wide = scan([0.1, 0.5], [0.2, 0.5], 2000, 1000);
    // Cover: 200x100 in a 100x100 box; face centre x = 0.15 * 200 = 30 -> clamped to 0%.
    expect(faceContentPosition(wide, { w: 100, h: 100 })).toEqual({ left: '0%', top: '50%' });
  });

  it('has nothing to say without a face', () => {
    expect(faceContentPosition(undefined, { w: 100, h: 100 })).toBeUndefined();
    expect(faceContentPosition({ v: 1, eyes: null, width: 1000, height: 2000 }, { w: 100, h: 100 })).toBeUndefined();
  });
});
