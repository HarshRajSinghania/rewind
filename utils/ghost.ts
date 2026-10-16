/**
 * Placement of the ghost (the last photo, drawn over the viewfinder). Pure — no React,
 * no native modules.
 */
import {
  computeFaceTransform,
  coverEyeDistance,
  eyeDistance,
  medianEyeDistance,
  EYE_ANCHOR_Y,
  type FaceFrameLayout,
  type Size,
} from '@/utils/faceAlign';
import type { FaceScan } from '@/types';

/** Where the eyes should be, normalized to the viewfinder; `dist` is a fraction of its width. */
export interface EyeTarget {
  x: number;
  y: number;
  dist: number;
}

export interface GhostPlacement {
  /** Image layout in viewfinder px, the same shape the timelapse player uses. */
  layout: FaceFrameLayout;
  /** The ghost's eyes as drawn: line your eyes up with these. */
  eyes: EyeTarget;
}

/**
 * Eyes on the timelapse anchor (centered, EYE_ANCHOR_Y down), level, and as far apart as
 * the album's median face — so lining up with the ghost frames today the way playback
 * will. null when the photo has no usable scan; the ghost then falls back to a cover fit.
 */
export function placeGhost(
  scan: FaceScan | undefined,
  albumScans: (FaceScan | undefined)[],
  view: Size,
): GhostPlacement | null {
  if (!scan) return null;
  const own = coverEyeDistance(scan, view);
  const dist = eyeDistance(scan);
  if (own === null || dist === null) return null;
  const layout = computeFaceTransform(scan, view, medianEyeDistance(albumScans, view) ?? own);
  if (!layout) return null;
  // The zoom cap can stop short of the median: aim at the eyes as drawn.
  const drawn = (dist * layout.width) / scan.width;
  return { layout, eyes: { x: 0.5, y: EYE_ANCHOR_Y, dist: drawn / view.w } };
}
