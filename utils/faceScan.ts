/**
 * Scans a saved photo with MediaPipe Face Landmarker: eye positions for timelapse alignment
 * and face measurements for the face trend.
 *
 * Detection runs on an upright, downscaled copy: a static decoder ignores EXIF orientation, so
 * scanning the original file would rotate coordinates 90° from what expo-image displays.
 * Coordinates are normalized by the copy's own size.
 */
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { detectFaceMesh, isFaceMeshAvailable } from '@/modules/face-mesh';
import { measureFace } from '@/utils/faceMetrics';
import type { FaceMeasure, FaceScan } from '@/types';

/** Bump to make useFaceScanBackfill rescan every photo (e.g. after changing this file). */
export const FACE_SCAN_VERSION = 2;

const SCAN_WIDTH = 1024;
const MESH_VALUES = 478 * 3;

const fixed = (v: number, digits: number) => Number(v.toFixed(digits));
const sig = (v: number, digits: number) => Number(v.toPrecision(digits));

/**
 * Rounded far below the 1.5–2% per-photo measurement noise: every album's photos share one
 * storage value, and full-precision doubles made each entry ~67% larger.
 */
function compact(eyes: NonNullable<FaceScan['eyes']>, m: FaceMeasure): Pick<FaceScan, 'eyes' | 'measure'> {
  const pt = (p: { x: number; y: number }) => ({ x: fixed(p.x, 5), y: fixed(p.y, 5) });
  return {
    eyes: { left: pt(eyes.left), right: pt(eyes.right) },
    measure: {
      ipd: fixed(m.ipd, 1),
      closeness: sig(m.closeness, 5),
      jaw: sig(m.jaw, 5),
      lowJaw: sig(m.lowJaw, 5),
      cheek: sig(m.cheek, 5),
      yaw: fixed(m.yaw, 2),
      pitch: fixed(m.pitch, 2),
      roll: fixed(m.roll, 2),
      smile: fixed(m.smile, 3),
      jawOpen: fixed(m.jawOpen, 3),
    },
  };
}

export function isFaceScanAvailable(): boolean {
  return isFaceMeshAvailable();
}

export function needsFaceScan(photo: { faceScan?: FaceScan }): boolean {
  return !photo.faceScan || photo.faceScan.v < FACE_SCAN_VERSION;
}

/** Throws on a per-photo failure; resolves 'unavailable' when the native module is missing. */
export async function scanPhoto(uri: string): Promise<FaceScan | 'unavailable'> {
  if (!isFaceScanAvailable()) return 'unavailable';

  // Free native bitmaps as soon as they're done with: a backfill runs hundreds of
  // these back to back, and the context reports no memory pressure to the GC.
  const context = ImageManipulator.manipulate(uri).resize({ width: SCAN_WIDTH });
  let rendered: Awaited<ReturnType<typeof context.renderAsync>>;
  try {
    rendered = await context.renderAsync();
  } finally {
    context.release();
  }
  let upright: { uri: string; width: number; height: number };
  try {
    upright = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  } finally {
    rendered.release();
  }
  try {
    const mesh = await detectFaceMesh(upright.uri);
    if (!mesh) return { v: FACE_SCAN_VERSION, eyes: null, width: upright.width, height: upright.height, measure: null };
    // A broken native result would put NaN into every trend value of the album; retry next visit.
    if (mesh.matrix.length !== 16 || mesh.landmarks.length < MESH_VALUES) throw new Error('malformed face mesh result');
    const { eyes, measure } = measureFace({ ...mesh, width: upright.width, height: upright.height });
    if (!Object.values(measure).every(Number.isFinite)) throw new Error('malformed face mesh result');
    return { v: FACE_SCAN_VERSION, width: upright.width, height: upright.height, ...compact(eyes, measure) };
  } finally {
    try { new File(upright.uri).delete(); } catch {}
  }
}
