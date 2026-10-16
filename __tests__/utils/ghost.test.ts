import { placeGhost, framingFromFace, DEFAULT_FRAMING } from '@/utils/ghost';
import { MAX_ZOOM_OVER_COVER } from '@/utils/faceAlign';
import type { FaceScan } from '@/types';

const VIEW = { w: 300, h: 400 };

function scan(left: [number, number], right: [number, number], width = 1000, height = 2000): FaceScan {
  return { v: 2, eyes: { left: { x: left[0], y: left[1] }, right: { x: right[0], y: right[1] } }, width, height };
}

/** Where a normalized image point lands: absolute layout, no rotation (level eyes). */
function land(p: ReturnType<typeof placeGhost>, s: FaceScan, pt: { x: number; y: number }) {
  const k = p!.layout.width / s.width;
  return { x: p!.layout.left + pt.x * s.width * k, y: p!.layout.top + pt.y * s.height * k };
}

describe('placeGhost', () => {
  // A close-up: eyes 0.2 of the photo's width apart, high in a tall photo.
  const closeUp = scan([0.4, 0.2], [0.6, 0.2]);

  it("puts the ghost's eyes where the framing says, as far apart as it says", () => {
    const framing = { x: 0.5, y: 0.383, dist: 0.115 };
    const p = placeGhost(closeUp, framing, VIEW)!;
    const l = land(p, closeUp, closeUp.eyes!.left);
    const r = land(p, closeUp, closeUp.eyes!.right);
    expect((l.x + r.x) / 2).toBeCloseTo(0.5 * VIEW.w, 6);
    expect(l.y).toBeCloseTo(0.383 * VIEW.h, 6);
    expect(r.x - l.x).toBeCloseTo(0.115 * VIEW.w, 6);
    expect(p.eyes).toEqual(framing);
  });

  it('follows an off-centre framing', () => {
    const p = placeGhost(closeUp, { x: 0.4, y: 0.5, dist: 0.1 }, VIEW)!;
    const l = land(p, closeUp, closeUp.eyes!.left);
    const r = land(p, closeUp, closeUp.eyes!.right);
    expect((l.x + r.x) / 2).toBeCloseTo(0.4 * VIEW.w, 6);
    expect(l.y).toBeCloseTo(0.5 * VIEW.h, 6);
  });

  it('aims at the eyes as drawn when the zoom cap stops short of the framing', () => {
    const tiny = scan([0.49, 0.2], [0.51, 0.2]); // 20 px apart -> 6 px under cover (0.3 scale)
    const p = placeGhost(tiny, { x: 0.5, y: 0.4, dist: 0.5 }, VIEW)!;
    expect(p.eyes.dist).toBeCloseTo((6 * MAX_ZOOM_OVER_COVER) / VIEW.w, 6);
  });

  it('has no placement without a usable scan or a measured viewfinder', () => {
    expect(placeGhost(undefined, DEFAULT_FRAMING, VIEW)).toBeNull();
    expect(placeGhost({ v: 2, eyes: null, width: 1000, height: 2000 }, DEFAULT_FRAMING, VIEW)).toBeNull();
    expect(placeGhost(closeUp, DEFAULT_FRAMING, { w: 0, h: 0 })).toBeNull();
  });

  it("defaults to an arm's-length framing (measured from the user's ideal shot)", () => {
    expect(DEFAULT_FRAMING).toEqual({ x: 0.5, y: 0.383, dist: 0.115 });
  });
});

describe('framingFromFace', () => {
  it("saves the live face's eye position and distance", () => {
    expect(framingFromFace({ hasFace: true, eyeMidX: 0.51234, eyeMidY: 0.38, eyeDist: 0.12 })).toEqual({ x: 0.512, y: 0.38, dist: 0.12 });
  });
  it('has nothing to save without both eyes', () => {
    expect(framingFromFace({ hasFace: true })).toBeNull();
    expect(framingFromFace({ hasFace: false, eyeMidX: 0.5, eyeMidY: 0.4, eyeDist: 0.1 })).toBeNull();
  });
});
