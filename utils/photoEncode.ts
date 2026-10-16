/**
 * Photo files are stored as q95 JPEGs, upright (EXIF orientation applied).
 *
 * Captures arrive at q98 and imports often at q100; those decoded ~33% slower for no visible
 * gain (PSNR 45 dB vs q95) and made 8x timelapse playback hold frames (measured on device:
 * 26 held vsyncs in 27 s at q100 vs 1 at q95). Files also shrink ~45%.
 */
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { PhotoEntry } from '@/types';

export const PHOTO_ENCODING = 'q95' as const;
const QUALITY = 0.95;

/** Re-encodes `srcUri` at q95 into Documents as `name`; returns the new file's uri. */
export async function encodePhoto(srcUri: string, name: string): Promise<string> {
  const context = ImageManipulator.manipulate(srcUri);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>>;
  try {
    rendered = await context.renderAsync();
  } finally {
    context.release();
  }
  let saved: { uri: string };
  try {
    saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
  } finally {
    rendered.release();
  }
  const dest = new File(Paths.document, name);
  // Only a run that died before saving its photo entry can leave this behind; nothing points at it.
  if (dest.exists) dest.delete();
  await new File(saved.uri).move(dest);
  return dest.uri;
}

/** Documents file name for the q95 copy of an existing photo file. */
export function encodedName(uri: string): string {
  const base = (uri.split('/').pop() ?? 'photo').replace(/\.jpe?g$/i, '');
  return `${base}_q95.jpg`;
}

/** A local photo file not yet stored as q95. */
export function needsEncoding(photo: Pick<PhotoEntry, 'imageUri' | 'encoding'>): boolean {
  return photo.encoding !== PHOTO_ENCODING && photo.imageUri.startsWith('file://');
}
