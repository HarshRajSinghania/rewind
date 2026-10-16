/**
 * Eye-lock alignment for timelapse playback. Pure — no React, no native modules.
 *
 * Input: a FaceScan (eyes normalized 0..1 of the upright saved image) and the player
 * size. Output: absolute layout + rotation (container px) for one frame's image so
 * the eye midpoint sits on the anchor, eyes level, eye distance = target.
 */
import type { FaceScan } from '@/types';

/** Eye midpoint target: horizontally centered, 40% down from the top. */
export const EYE_ANCHOR_Y = 0.4;

/** Zoom cap relative to the default cover fit, so a far-away face isn't blown up to mush. */
export const MAX_ZOOM_OVER_COVER = 3;

export interface Size {
  w: number;
  h: number;
}

export interface FaceFrameLayout {
  width: number;
  height: number;
  left: number;
  top: number;
  /**
   * Rotation pivot (the eye midpoint) in the image's own box, as RN's [x, y, z] array.
   * Not a "Xpx Ypx" string: RN's string parser only takes integer px and throws on
   * fractional pivots.
   */
  transformOrigin: [number, number, number];
  /** Radians about transformOrigin; levels the eye line. */
  rotation: number;
}

interface EyeGeometry {
  midX: number;
  midY: number;
  dist: number;
  angle: number;
}

/** Eye midpoint, distance and tilt in scanned-image px; null if unusable. */
function eyeGeometry(scan: FaceScan): EyeGeometry | null {
  if (!scan.eyes || !(scan.width > 0 && scan.height > 0)) return null;
  const { left, right } = scan.eyes;
  // Order by x so a mirrored file's swapped labels can't turn the frame upside down.
  const [a, b] = left.x <= right.x ? [left, right] : [right, left];
  const ax = a.x * scan.width;
  const ay = a.y * scan.height;
  const bx = b.x * scan.width;
  const by = b.y * scan.height;
  const dist = Math.hypot(bx - ax, by - ay);
  if (!(dist > 1e-6)) return null;
  return { midX: (ax + bx) / 2, midY: (ay + by) / 2, dist, angle: Math.atan2(by - ay, bx - ax) };
}

/** Scale that `contentFit="cover"` would apply to this image in this container. */
function coverScale(scan: FaceScan, container: Size): number {
  return Math.max(container.w / scan.width, container.h / scan.height);
}

/** Eye distance in the scan's own px; null if the scan has no usable eyes. */
export function eyeDistance(scan: FaceScan): number | null {
  return eyeGeometry(scan)?.dist ?? null;
}

/** Eye distance a frame shows at under the default cover fit in this container. */
export function coverEyeDistance(scan: FaceScan, container: Size): number | null {
  const g = eyeGeometry(scan);
  return g && container.w > 0 && container.h > 0 ? g.dist * coverScale(scan, container) : null;
}

export function computeFaceTransform(
  scan: FaceScan,
  container: Size,
  targetEyeDist: number,
): FaceFrameLayout | null {
  if (!(container.w > 0 && container.h > 0 && targetEyeDist > 0)) return null;
  const g = eyeGeometry(scan);
  if (!g) return null;
  const s = Math.min(targetEyeDist / g.dist, MAX_ZOOM_OVER_COVER * coverScale(scan, container));
  const midX = g.midX * s;
  const midY = g.midY * s;
  return {
    width: scan.width * s,
    height: scan.height * s,
    left: container.w / 2 - midX,
    top: EYE_ANCHOR_Y * container.h - midY,
    transformOrigin: [midX, midY, 0],
    rotation: -g.angle,
  };
}

/**
 * Target eye distance for a sequence: the median eye distance the frames have under
 * today's cover fit, so a typical frame stays about as large as it looks unaligned.
 * null with fewer than two frames that have eyes.
 */
export function medianEyeDistance(scans: (FaceScan | undefined)[], container: Size): number | null {
  if (!(container.w > 0 && container.h > 0)) return null;
  const dists: number[] = [];
  for (const scan of scans) {
    const d = scan ? coverEyeDistance(scan, container) : null;
    if (d !== null) dists.push(d);
  }
  if (dists.length < 2) return null;
  dists.sort((x, y) => x - y);
  const mid = dists.length >> 1;
  return dists.length % 2 ? dists[mid] : (dists[mid - 1] + dists[mid]) / 2;
}
