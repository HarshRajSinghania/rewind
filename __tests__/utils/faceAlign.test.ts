import {
  computeFaceTransform,
  medianEyeDistance,
  EYE_ANCHOR_Y,
  MAX_ZOOM_OVER_COVER,
  type FaceFrameLayout,
} from '@/utils/faceAlign';
import type { FaceScan } from '@/types';

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
  const [ox, oy] = layout.transformOrigin.split(' ').map((v) => parseFloat(v));
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
