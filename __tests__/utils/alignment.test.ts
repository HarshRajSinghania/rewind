import { computeAlignmentScore, alignmentStatus, shouldPropagateFaceUpdate } from '@/utils/alignment';

const TARGET = { x: 0.35, y: 0.3, width: 0.3, height: 0.4 };

function centeredFace() {
  return {
    hasFace: true,
    faceX: 0.35,
    faceY: 0.3,
    faceWidth: 0.3,
    faceHeight: 0.4,
    yawAngle: 0,
    rollAngle: 0,
  };
}

describe('computeAlignmentScore', () => {
  it('returns 0 when no face is detected', () => {
    expect(computeAlignmentScore({ ...centeredFace(), hasFace: false }, TARGET)).toBe(0);
  });

  it('scores a perfect match as 1', () => {
    expect(computeAlignmentScore(centeredFace(), TARGET)).toBeCloseTo(1, 10);
  });

  it('gates far-away faces to 0 regardless of size/angles', () => {
    const far = { ...centeredFace(), faceX: 0.0, faceY: 0.0 };
    expect(computeAlignmentScore(far, TARGET)).toBe(0);
  });

  it('bootstraps from the default center target when none is set', () => {
    // Default target: center (0.5, 0.5), size 0.3x0.4
    const face = {
      hasFace: true,
      faceX: 0.35,
      faceY: 0.3,
      faceWidth: 0.3,
      faceHeight: 0.4,
      yawAngle: 0,
      rollAngle: 0,
    };
    expect(computeAlignmentScore(face, null)).toBeCloseTo(1, 10);
  });

  it('penalizes yaw fully turned away', () => {
    const score = computeAlignmentScore({ ...centeredFace(), yawAngle: 45 }, TARGET);
    // position 1 * .45 + size 1 * .20 + yaw 0 * .20 + roll 1 * .15
    expect(score).toBeCloseTo(0.8, 10);
  });

  it('penalizes size mismatch by area ratio', () => {
    const small = { ...centeredFace(), faceWidth: 0.15, faceHeight: 0.2, faceX: 0.425, faceY: 0.4 };
    const score = computeAlignmentScore(small, TARGET);
    // area ratio 0.25 → 0.45 + 0.25*.20 + 0.20 + 0.15
    expect(score).toBeCloseTo(0.85, 10);
  });

  it('degrades smoothly with distance (near miss > far miss)', () => {
    const near = computeAlignmentScore({ ...centeredFace(), faceX: 0.37 }, TARGET);
    const far = computeAlignmentScore({ ...centeredFace(), faceX: 0.42 }, TARGET);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
  });
});

describe('shouldPropagateFaceUpdate', () => {
  it('always propagates presence changes', () => {
    expect(shouldPropagateFaceUpdate(true, false, 1000, 1000)).toBe(true);
    expect(shouldPropagateFaceUpdate(false, true, 1000, 1000)).toBe(true);
  });

  it('throttles steady-state updates to the interval', () => {
    expect(shouldPropagateFaceUpdate(true, true, 1050, 1000)).toBe(false);
    expect(shouldPropagateFaceUpdate(true, true, 1099, 1000)).toBe(false);
    expect(shouldPropagateFaceUpdate(true, true, 1100, 1000)).toBe(true);
    expect(shouldPropagateFaceUpdate(false, false, 2000, 1000)).toBe(true);
  });
});

describe('computeAlignmentScore with an eye target (the ghost)', () => {
  const EYES = { x: 0.5, y: 0.4, dist: 0.2 };
  const face = (eyeMidX: number, eyeMidY: number, eyeDist: number) => ({
    ...centeredFace(),
    eyeMidX,
    eyeMidY,
    eyeDist,
  });

  it("scores eyes on the ghost's eyes as a perfect match, wherever the face box is", () => {
    expect(computeAlignmentScore({ ...face(0.5, 0.4, 0.2), faceX: 0, faceY: 0 }, EYES)).toBeCloseTo(1, 10);
  });

  it('scores eyes beside the target lower, and far away as 0', () => {
    const near = computeAlignmentScore(face(0.55, 0.4, 0.2), EYES);
    expect(near).toBeLessThan(1);
    expect(near).toBeGreaterThan(0.75);
    expect(computeAlignmentScore(face(0.9, 0.9, 0.2), EYES)).toBe(0);
  });

  it('does not count a face much too far from the camera, however centered', () => {
    expect(computeAlignmentScore(face(0.5, 0.4, 0.1), EYES)).toBe(0);
    const slightly = computeAlignmentScore(face(0.5, 0.4, 0.18), EYES);
    expect(slightly).toBeLessThan(1);
    expect(slightly).toBeGreaterThan(0.75);
  });

  it('scores 0 when the face has no eyes to compare', () => {
    expect(computeAlignmentScore(centeredFace(), EYES)).toBe(0);
  });
});

describe('alignmentStatus', () => {
  const EYES = { x: 0.5, y: 0.4, dist: 0.2 };
  const base = { silent: false, score: 0.3, threshold: 0.75 };
  const face = (eyeDist: number) => ({ ...centeredFace(), eyeMidX: 0.5, eyeMidY: 0.4, eyeDist });

  it('reports stalls, missing faces, alignment and holding still first', () => {
    expect(alignmentStatus({ ...base, silent: true, face: face(0.2), target: EYES })).toBe('face detection stalled');
    expect(alignmentStatus({ ...base, face: { ...face(0.2), hasFace: false }, target: EYES })).toBe('no face detected');
    expect(alignmentStatus({ ...base, score: 0.8, face: face(0.2), target: EYES })).toBe('aligned');
    expect(alignmentStatus({ ...base, score: 0.65, face: face(0.2), target: EYES })).toBe('hold still');
  });

  it("asks you to move closer or back until your eyes are as far apart as the ghost's", () => {
    expect(alignmentStatus({ ...base, face: face(0.14), target: EYES })).toBe('move closer');
    expect(alignmentStatus({ ...base, face: face(0.26), target: EYES })).toBe('move back');
    expect(alignmentStatus({ ...base, face: face(0.2), target: EYES })).toBe('center your face');
  });

  it('asks a small face to move closer when the target is a face box', () => {
    const tiny = { ...centeredFace(), faceWidth: 0.1, faceHeight: 0.2 };
    expect(alignmentStatus({ ...base, face: tiny, target: TARGET })).toBe('move closer');
    expect(alignmentStatus({ ...base, face: centeredFace(), target: null })).toBe('center your face');
  });
});
