/**
 * How the camera preview is mirrored. Pure — no React, no native modules.
 *
 * VisionCamera always shows the front preview mirrored (like a mirror), and saves a
 * front photo mirrored only when `isMirrored` (the "mirror selfies" setting) is on.
 * The preview is flipped back when it's off, so it shows what will be saved.
 * MLKit reports unmirrored coordinates, so overlays flip X while the shown preview
 * is mirrored.
 */
export interface PreviewMirroring {
  /** Apply scaleX: -1 to the native preview. */
  flipPreview: boolean;
  /** The preview on screen is a mirror image of the scene. */
  shownMirrored: boolean;
}

export function previewMirroring(facing: 'front' | 'back', isMirrored: boolean): PreviewMirroring {
  const front = facing === 'front';
  return { flipPreview: front && !isMirrored, shownMirrored: front && isMirrored };
}

export interface FrameToView {
  /** Frame-normalized x (0..1 of the upright frame) to view-normalized x. */
  x: (n: number) => number;
  y: (n: number) => number;
  /** View widths/heights per frame width/height, for box sizes and distances. */
  scaleX: number;
  scaleY: number;
}

const IDENTITY: FrameToView = { x: (n) => n, y: (n) => n, scaleX: 1, scaleY: 1 };

/**
 * Maps detector coordinates (normalized to the upright camera frame) onto the preview
 * view, which shows the frame cover-fit (center-cropped to the view's shape) and maybe
 * mirrored. Identity until both sizes are known.
 */
export function frameToView(
  frame: { w: number; h: number },
  view: { w: number; h: number },
  mirrored: boolean,
): FrameToView {
  if (!(frame.w > 0 && frame.h > 0 && view.w > 0 && view.h > 0)) return IDENTITY;
  const s = Math.max(view.w / frame.w, view.h / frame.h);
  const scaleX = (frame.w * s) / view.w;
  const scaleY = (frame.h * s) / view.h;
  const offX = (scaleX - 1) / 2;
  const offY = (scaleY - 1) / 2;
  return {
    x: mirrored ? (n) => 1 - (n * scaleX - offX) : (n) => n * scaleX - offX,
    y: (n) => n * scaleY - offY,
    scaleX,
    scaleY,
  };
}

/**
 * Size of the upright image the face detector reports coordinates in. A frame turned
 * 90/270 degrees (Android's sideways sensor buffer in a portrait UI) is upright with its
 * sides swapped.
 */
export function uprightFrameSize(
  width: number,
  height: number,
  orientation: 'portrait' | 'portrait-upside-down' | 'landscape-left' | 'landscape-right',
): { w: number; h: number } {
  const sideways = orientation === 'landscape-left' || orientation === 'landscape-right';
  return sideways ? { w: height, h: width } : { w: width, h: height };
}

/**
 * Detector contour px [x1, y1, x2, y2, …] → view-normalized coordinates, as a new array.
 * Frame-processor results reach JS as read-only arrays, so never map them in place.
 */
export function mapContour(px: readonly number[], upright: { w: number; h: number }, m: FrameToView): number[] {
  const out = new Array<number>(px.length);
  for (let i = 0; i < px.length; i += 2) {
    out[i] = m.x(px[i] / upright.w);
    out[i + 1] = m.y(px[i + 1] / upright.h);
  }
  return out;
}
