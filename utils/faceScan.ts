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
import type { FaceScan } from '@/types';

/** Bump to make useFaceScanBackfill rescan every photo (e.g. after changing this file). */
export const FACE_SCAN_VERSION = 2;

const SCAN_WIDTH = 1024;

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
    const { eyes, measure } = measureFace({ ...mesh, width: upright.width, height: upright.height });
    return { v: FACE_SCAN_VERSION, eyes, width: upright.width, height: upright.height, measure };
  } finally {
    try { new File(upright.uri).delete(); } catch {}
  }
}
