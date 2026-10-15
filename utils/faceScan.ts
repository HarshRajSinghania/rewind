/**
 * Scans a saved photo for the eye positions used by timelapse alignment.
 *
 * Detection runs on an upright, downscaled copy: the Android static-image detector
 * decodes with BitmapFactory and ignores EXIF orientation, so scanning the original
 * file would rotate coordinates 90° from what expo-image displays. Downscaling also
 * makes detection faster; coordinates are normalized by the copy's own size.
 */
import { NativeModules } from 'react-native';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { detectFaces, type Face } from 'react-native-vision-camera-face-detector';
import type { FaceScan } from '@/types';

/** Bump to make useFaceScanBackfill rescan every photo (e.g. after changing this file). */
export const FACE_SCAN_VERSION = 1;

const SCAN_WIDTH = 1024;

type Point = { x: number; y: number };

export function isFaceScanAvailable(): boolean {
  return NativeModules.ImageFaceDetector != null;
}

export function needsFaceScan(photo: { faceScan?: FaceScan }): boolean {
  return !photo.faceScan || photo.faceScan.v < FACE_SCAN_VERSION;
}

function largestFace(faces: Face[]): Face | undefined {
  let best: Face | undefined;
  let bestArea = -1;
  for (const face of faces) {
    const area = (face.bounds?.width ?? 0) * (face.bounds?.height ?? 0);
    if (area > bestArea) {
      best = face;
      bestArea = area;
    }
  }
  return best;
}

// iOS reports a missing landmark as (0, 0) instead of omitting it.
function isPresent(p: Point | undefined): p is Point {
  return !!p && !(p.x === 0 && p.y === 0);
}

/** Throws on a per-photo failure; resolves 'unavailable' when the native detector is missing. */
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
    const faces = await detectFaces({
      image: upright.uri,
      options: { performanceMode: 'accurate', landmarkMode: 'all' },
    });
    if (!faces) return 'unavailable';

    const face = largestFace(faces);
    const l: Point | undefined = face?.landmarks?.LEFT_EYE;
    const r: Point | undefined = face?.landmarks?.RIGHT_EYE;
    const eyes = isPresent(l) && isPresent(r)
      ? {
          left: { x: l.x / upright.width, y: l.y / upright.height },
          right: { x: r.x / upright.width, y: r.y / upright.height },
        }
      : null;
    return { v: FACE_SCAN_VERSION, eyes, width: upright.width, height: upright.height };
  } finally {
    try { new File(upright.uri).delete(); } catch {}
  }
}
