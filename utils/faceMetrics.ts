/**
 * Face measurements from a MediaPipe Face Landmarker mesh. Pure — no React, no native modules.
 * Landmarks are the 478-point mesh (468 face + 10 iris), normalized; px = (x·W, y·H, z·W).
 */
import type { FaceMeasure, FaceScan } from '@/types';

export interface FaceMeshResult {
  width: number;
  height: number;
  /** 478 × (x, y, z), normalized. */
  landmarks: number[];
  blendshapes: Record<string, number>;
  /** Facial transformation matrix, 4×4 row-major. */
  matrix: number[];
}

const IRIS_A = 468;
const IRIS_B = 473;
const JAW: [number, number] = [172, 397];
const LOW_JAW: [number, number] = [136, 365];
const CHEEK: [number, number] = [234, 454];

export const MAX_YAW = 8;
export const MAX_SMILE = 0.25;
export const MAX_JAW_OPEN = 0.15;

type P3 = [number, number, number];

function px(r: FaceMeshResult, i: number): P3 {
  const l = r.landmarks;
  return [l[i * 3] * r.width, l[i * 3 + 1] * r.height, l[i * 3 + 2] * r.width];
}

const dist3 = (a: P3, b: P3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function poseFromMatrix(m: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => m[row * 4 + col];
  const deg = 180 / Math.PI;
  return {
    yaw: Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2))) * deg + 0,
    pitch: Math.atan2(r(2, 1), r(2, 2)) * deg + 0,
    roll: Math.atan2(r(1, 0), r(0, 0)) * deg + 0,
  };
}

export function measureFace(r: FaceMeshResult): { eyes: NonNullable<FaceScan['eyes']>; measure: FaceMeasure } {
  const a = px(r, IRIS_A);
  const b = px(r, IRIS_B);
  const ipd3 = dist3(a, b);
  const ipd = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ratio = ([i, j]: [number, number]) => dist3(px(r, i), px(r, j)) / ipd3;
  const [l, rt] = a[0] <= b[0] ? [a, b] : [b, a];
  const bs = r.blendshapes;
  return {
    eyes: {
      left: { x: l[0] / r.width, y: l[1] / r.height },
      right: { x: rt[0] / r.width, y: rt[1] / r.height },
    },
    measure: {
      ipd,
      closeness: ipd / r.width,
      jaw: ratio(JAW),
      lowJaw: ratio(LOW_JAW),
      cheek: ratio(CHEEK),
      ...poseFromMatrix(r.matrix),
      smile: ((bs.mouthSmileLeft ?? 0) + (bs.mouthSmileRight ?? 0)) / 2,
      jawOpen: bs.jawOpen ?? 0,
    },
  };
}

export function notComparableReason(m: FaceMeasure): string | null {
  if (Math.abs(m.yaw) > MAX_YAW) return 'head turned';
  if (m.smile > MAX_SMILE) return 'smiling';
  if (m.jawOpen > MAX_JAW_OPEN) return 'mouth open';
  return null;
}

export function isComparable(m: FaceMeasure): boolean {
  return notComparableReason(m) === null;
}

/** The headline "face width index": lower-face width ÷ pupil distance. */
export function widthIndex(m: FaceMeasure): number {
  return (m.jaw + m.lowJaw) / 2;
}
