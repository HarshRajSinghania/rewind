/**
 * Face-alignment scoring for auto-capture, extracted from app/(tabs)/camera.tsx
 * so it can be unit-tested. Pure function — no React, no native modules.
 *
 * Coordinates are normalized 0..1 in preview space. Angles in degrees.
 */

export interface AlignmentTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AlignmentFace {
  hasFace: boolean;
  faceX: number;
  faceY: number;
  faceWidth: number;
  faceHeight: number;
  yawAngle: number;
  rollAngle: number;
}

export function computeAlignmentScore(
  face: AlignmentFace,
  alignmentTarget: AlignmentTarget | null,
): number {
  if (!face.hasFace) return 0;

  let targetCX = 0.5;
  let targetCY = 0.5;
  let targetW = 0.3;
  let targetH = 0.4;

  if (alignmentTarget) {
    targetCX = alignmentTarget.x + alignmentTarget.width / 2;
    targetCY = alignmentTarget.y + alignmentTarget.height / 2;
    targetW = alignmentTarget.width;
    targetH = alignmentTarget.height;
  }

  const cx = face.faceX + face.faceWidth / 2;
  const cy = face.faceY + face.faceHeight / 2;

  const dx = cx - targetCX;
  const dy = cy - targetCY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const positionScore = Math.max(0, 1 - dist * 4);

  // Gate: face must be reasonably close to target position before other
  // factors (size, yaw, roll) can contribute to the score.
  if (positionScore < 0.1) return 0;

  const area = face.faceWidth * face.faceHeight;
  const targetArea = targetW * targetH;
  const areaRatio = targetArea > 0 ? Math.min(area / targetArea, targetArea / area) : 0;
  const sizeScore = areaRatio;

  const yawScore = Math.max(0, 1 - Math.abs(face.yawAngle) / 45);
  const rollScore = Math.max(0, 1 - Math.abs(face.rollAngle) / 30);

  return positionScore * 0.45 + sizeScore * 0.20 + yawScore * 0.20 + rollScore * 0.15;
}

/**
 * Throttle gate for propagating face-detector results into React state.
 * The frame processor runs natively at up to 15fps; pushing every frame over
 * the worklet→JS bridge into setState would re-render the camera screen
 * constantly (battery + heat). Shared values (FaceGuide dots) still update
 * every frame — only the React state propagation is throttled.
 *
 * Always propagates face presence changes (appeared/disappeared) so the UI
 * reacts instantly; position/size/angle updates at most every `minIntervalMs`.
 */
export function shouldPropagateFaceUpdate(
  hasFace: boolean,
  prevHasFace: boolean,
  now: number,
  lastPropagatedAt: number,
  minIntervalMs = 100,
): boolean {
  if (hasFace !== prevHasFace) return true;
  return now - lastPropagatedAt >= minIntervalMs;
}
