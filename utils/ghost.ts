/**
 * Placement of the ghost (the last photo, drawn over the viewfinder). Pure — no React,
 * no native modules.
 */
import { computeFaceTransform, eyeDistance, type FaceFrameLayout, type Size } from '@/utils/faceAlign';
import type { FaceScan, Framing } from '@/types';

/** Where the eyes should be, normalized to the viewfinder; `dist` is a fraction of its width. */
export type EyeTarget = Framing;

/**
 * Arm's-length framing, measured (MediaPipe) from the shot the user called ideal: eyes
 * centered, 38% down, pupils 0.115 frame-widths apart. Used until an album saves its own.
 */
export const DEFAULT_FRAMING: Framing = { x: 0.5, y: 0.383, dist: 0.115 };

export interface GhostPlacement {
  /** Image layout in viewfinder px, the same shape the timelapse player uses. */
  layout: FaceFrameLayout;
  /** The ghost's eyes as drawn: line your eyes up with these. */
  eyes: EyeTarget;
}

/**
 * The last photo placed so its eyes sit where the album's framing puts them, level and as far
 * apart as the framing says — lining up with it gives the framing the user chose. null when the
 * photo has no usable scan; the ghost then falls back to a cover fit.
 */
export function placeGhost(scan: FaceScan | undefined, framing: Framing, view: Size): GhostPlacement | null {
  if (!scan) return null;
  const dist = eyeDistance(scan);
  if (dist === null) return null;
  const layout = computeFaceTransform(scan, view, framing.dist * view.w, framing);
  if (!layout) return null;
  // The zoom cap can stop short of the framing: aim at the eyes as drawn.
  const drawn = (dist * layout.width) / scan.width;
  return { layout, eyes: { x: framing.x, y: framing.y, dist: drawn / view.w } };
}

/** The live face's framing, to save as the album's; null without both eyes. */
export function framingFromFace(face: { hasFace: boolean; eyeMidX?: number; eyeMidY?: number; eyeDist?: number }): Framing | null {
  if (!face.hasFace || face.eyeMidX === undefined || face.eyeMidY === undefined || !(face.eyeDist! > 0)) return null;
  const r = (v: number) => Number(v.toFixed(3));
  return { x: r(face.eyeMidX), y: r(face.eyeMidY), dist: r(face.eyeDist!) };
}
