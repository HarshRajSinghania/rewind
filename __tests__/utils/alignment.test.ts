import { computeAlignmentScore, shouldPropagateFaceUpdate } from '@/utils/alignment';

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
