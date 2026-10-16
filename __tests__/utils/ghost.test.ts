import { placeGhost } from '@/utils/ghost';
import { EYE_ANCHOR_Y, MAX_ZOOM_OVER_COVER } from '@/utils/faceAlign';
import type { FaceScan } from '@/types';

const VIEW = { w: 300, h: 400 };

function scan(left: [number, number], right: [number, number], width = 1000, height = 2000): FaceScan {
  return { v: 1, eyes: { left: { x: left[0], y: left[1] }, right: { x: right[0], y: right[1] } }, width, height };
}

/** Where a normalized image point lands: absolute layout, no rotation (level eyes). */
function land(p: ReturnType<typeof placeGhost>, s: FaceScan, pt: { x: number; y: number }) {
  const k = p!.layout.width / s.width;
  return { x: p!.layout.left + pt.x * s.width * k, y: p!.layout.top + pt.y * s.height * k };
}

describe('placeGhost', () => {
  // A tall imported photo with the face high up: cover fit alone shows it near the top.
  const high = scan([0.4, 0.2], [0.6, 0.2]);

  it('puts the eyes centered on the timelapse anchor instead of where the crop leaves them', () => {
    const p = placeGhost(high, [], VIEW)!;
    const l = land(p, high, high.eyes!.left);
    const r = land(p, high, high.eyes!.right);
    expect((l.x + r.x) / 2).toBeCloseTo(VIEW.w / 2, 6);
    expect(l.y).toBeCloseTo(EYE_ANCHOR_Y * VIEW.h, 6);
    expect(p.eyes.x).toBe(0.5);
    expect(p.eyes.y).toBe(EYE_ANCHOR_Y);
  });

  it('keeps the face as large as a plain cover fit shows it when the album has no other faces', () => {
    // cover scale = max(300/1000, 400/2000) = 0.3; eyes 200 px apart -> 60 px.
    const p = placeGhost(high, [high], VIEW)!;
    expect(p.layout.width / high.width).toBeCloseTo(0.3, 6);
    expect(p.eyes.dist).toBeCloseTo(60 / VIEW.w, 6);
  });

  it("sizes the face to the album's median, so every day is framed alike", () => {
    // Album faces at 0.3 cover scale: 60, 90 and 120 px apart -> median 90.
    const album = [scan([0.4, 0.3], [0.6, 0.3]), scan([0.35, 0.3], [0.65, 0.3]), scan([0.3, 0.3], [0.7, 0.3])];
    const p = placeGhost(high, album, VIEW)!;
    const l = land(p, high, high.eyes!.left);
    const r = land(p, high, high.eyes!.right);
    expect(r.x - l.x).toBeCloseTo(90, 6);
    expect(p.eyes.dist).toBeCloseTo(90 / VIEW.w, 6);
  });

  it('aims at the eyes as drawn when the zoom cap stops short of the median', () => {
    const tiny = scan([0.49, 0.2], [0.51, 0.2]); // 20 px apart -> 6 px under cover
    const big = [scan([0.1, 0.3], [0.9, 0.3]), scan([0.1, 0.3], [0.9, 0.3])]; // 240 px
    const p = placeGhost(tiny, big, VIEW)!;
    expect(p.eyes.dist).toBeCloseTo((6 * MAX_ZOOM_OVER_COVER) / VIEW.w, 6);
  });

  it('has no placement without a usable scan or a measured viewfinder', () => {
    expect(placeGhost(undefined, [], VIEW)).toBeNull();
    expect(placeGhost({ v: 1, eyes: null, width: 1000, height: 2000 }, [], VIEW)).toBeNull();
    expect(placeGhost(high, [], { w: 0, h: 0 })).toBeNull();
  });
});
