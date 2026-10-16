import { measureFace, poseFromMatrix, isComparable, notComparableReason, widthIndex, type FaceMeshResult } from '@/utils/faceMetrics';
import type { FaceMeasure } from '@/types';

const W = 1000;
const H = 2000;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mesh(points: Record<number, [number, number, number]>, extra: Partial<FaceMeshResult> = {}): FaceMeshResult {
  const landmarks = new Array(478 * 3).fill(0.5);
  for (const [i, [x, y, z]] of Object.entries(points)) landmarks.splice(Number(i) * 3, 3, x, y, z);
  return { width: W, height: H, landmarks, blendshapes: { mouthSmileLeft: 0.1, mouthSmileRight: 0.3, jawOpen: 0.05 }, matrix: IDENTITY, ...extra };
}

const FRONT = {
  468: [0.6, 0.4, 0] as [number, number, number], // image-right iris
  473: [0.4, 0.4, 0] as [number, number, number], // image-left iris -> 200 px apart
  172: [0.3, 0.6, 0] as [number, number, number],
  397: [0.7, 0.6, 0] as [number, number, number], // 400 px
  136: [0.35, 0.7, 0] as [number, number, number],
  365: [0.65, 0.7, 0] as [number, number, number], // 300 px
  234: [0.25, 0.45, 0] as [number, number, number],
  454: [0.75, 0.45, 0] as [number, number, number], // 500 px
};

describe('measureFace', () => {
  it('divides face widths by the pupil distance and reports closeness', () => {
    const { measure } = measureFace(mesh(FRONT));
    expect(measure.ipd).toBeCloseTo(200, 6);
    expect(measure.closeness).toBeCloseTo(0.2, 6);
    expect(measure.jaw).toBeCloseTo(2, 6);
    expect(measure.lowJaw).toBeCloseTo(1.5, 6);
    expect(measure.cheek).toBeCloseTo(2.5, 6);
    expect(widthIndex(measure)).toBeCloseTo(1.75, 6);
  });

  it('measures in 3D, with z in the same px scale as x', () => {
    // Jaw points 0.1 apart in z (100 px): 3D jaw width = hypot(400, 100).
    const { measure } = measureFace(mesh({ ...FRONT, 172: [0.3, 0.6, 0.05], 397: [0.7, 0.6, -0.05] }));
    expect(measure.jaw).toBeCloseTo(Math.hypot(400, 100) / 200, 6);
  });

  it('returns the pupils as eyes, left = smaller x, normalized to the image', () => {
    const { eyes } = measureFace(mesh(FRONT));
    expect(eyes).toEqual({ left: { x: 0.4, y: 0.4 }, right: { x: 0.6, y: 0.4 } });
  });

  it('averages the two smile blendshapes and keeps jawOpen', () => {
    const { measure } = measureFace(mesh(FRONT));
    expect(measure.smile).toBeCloseTo(0.2, 6);
    expect(measure.jawOpen).toBeCloseTo(0.05, 6);
  });
});

describe('poseFromMatrix (row-major 4x4)', () => {
  const deg = Math.PI / 180;
  const rot = (r: number[][]) => [...r[0], 0, ...r[1], 0, ...r[2], 0, 0, 0, 0, 1];
  it('is level for the identity', () => {
    expect(poseFromMatrix(IDENTITY)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
  });
  it('reads yaw, pitch and roll in degrees', () => {
    const c = Math.cos(10 * deg);
    const s = Math.sin(10 * deg);
    expect(poseFromMatrix(rot([[c, 0, s], [0, 1, 0], [-s, 0, c]])).yaw).toBeCloseTo(10, 6);
    expect(poseFromMatrix(rot([[1, 0, 0], [0, c, -s], [0, s, c]])).pitch).toBeCloseTo(10, 6);
    expect(poseFromMatrix(rot([[c, -s, 0], [s, c, 0], [0, 0, 1]])).roll).toBeCloseTo(10, 6);
  });
});

describe('isComparable / notComparableReason', () => {
  const base: FaceMeasure = { ipd: 200, closeness: 0.2, jaw: 2, lowJaw: 1.5, cheek: 2.5, yaw: 0, pitch: 10, roll: 0, smile: 0, jawOpen: 0 };
  it('accepts a neutral frontal face', () => {
    expect(isComparable(base)).toBe(true);
    expect(notComparableReason(base)).toBeNull();
  });
  it('rejects a turned head, a smile or an open mouth, naming why', () => {
    expect(notComparableReason({ ...base, yaw: -9 })).toBe('head turned');
    expect(notComparableReason({ ...base, smile: 0.4 })).toBe('smiling');
    expect(notComparableReason({ ...base, jawOpen: 0.2 })).toBe('mouth open');
    expect(isComparable({ ...base, yaw: 9 })).toBe(false);
  });
});
