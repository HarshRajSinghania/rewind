/**
 * Face-alignment scoring for auto-capture, extracted from app/(tabs)/camera.tsx
 * so it can be unit-tested. Pure function — no React, no native modules.
 *
 * Coordinates are normalized 0..1 in preview space. Angles in degrees.
 */
import type { EyeTarget } from '@/utils/ghost';

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
  /** Eye midpoint and distance (a fraction of the view width), when the detector saw both eyes. */
  eyeMidX?: number;
  eyeMidY?: number;
  eyeDist?: number;
}

/** Eye distance ratio (smaller / larger) below which a face doesn't count as aligned. */
const MIN_EYE_DIST_RATIO = 0.8;

function isEyeTarget(target: AlignmentTarget | EyeTarget | null): target is EyeTarget {
  return !!target && 'dist' in target;
}

function angleScores(face: AlignmentFace): number {
  const yawScore = Math.max(0, 1 - Math.abs(face.yawAngle) / 45);
  const rollScore = Math.max(0, 1 - Math.abs(face.rollAngle) / 30);
  return yawScore * 0.20 + rollScore * 0.15;
}

/** Eyes against the ghost's eyes: position first, then eye distance (how far from the camera). */
function eyeScore(face: AlignmentFace, target: EyeTarget): number {
  if (face.eyeMidX === undefined || face.eyeMidY === undefined || !(face.eyeDist! > 0)) return 0;
  const dist = Math.hypot(face.eyeMidX - target.x, face.eyeMidY - target.y);
  const positionScore = Math.max(0, 1 - dist * 4);
  if (positionScore < 0.1) return 0;
  const ratio = Math.min(face.eyeDist! / target.dist, target.dist / face.eyeDist!);
  if (ratio < MIN_EYE_DIST_RATIO) return 0;
  const sizeScore = (ratio - MIN_EYE_DIST_RATIO) / (1 - MIN_EYE_DIST_RATIO);
  return positionScore * 0.45 + sizeScore * 0.20 + angleScores(face);
}

export function computeAlignmentScore(
  face: AlignmentFace,
  alignmentTarget: AlignmentTarget | EyeTarget | null,
): number {
  if (!face.hasFace) return 0;
  if (isEyeTarget(alignmentTarget)) return eyeScore(face, alignmentTarget);

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

  return positionScore * 0.45 + sizeScore * 0.20 + angleScores(face);
}

/** The camera screen's one-line face status. */
export function alignmentStatus({ silent, face, score, threshold, target }: {
  silent: boolean;
  face: AlignmentFace;
  score: number;
  threshold: number;
  target: AlignmentTarget | EyeTarget | null;
}): string {
  if (silent) return 'face detection stalled';
  if (!face.hasFace) return 'no face detected';
  if (score >= threshold) return 'aligned';
  if (score >= threshold - 0.15) return 'hold still';
  if (isEyeTarget(target) && face.eyeDist! > 0) {
    if (face.eyeDist! / target.dist < MIN_EYE_DIST_RATIO) return 'move closer';
    if (target.dist / face.eyeDist! < MIN_EYE_DIST_RATIO) return 'move back';
  } else if (face.faceWidth * face.faceHeight < 0.04) {
    return 'move closer';
  }
  return 'center your face';
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
