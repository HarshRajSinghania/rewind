import type { ImageSource, ImageProps } from 'expo-image';

export function getImageSource(uri: string): ImageSource {
  // All URIs are either https:// (Unsplash/mock) or file:// (real captured photos)
  return { uri };
}

/**
 * Cache policy for a photo: local files stay out of the disk cache. Glide otherwise
 * re-encodes every resized decode to disk (full-size, quality 100) — measured at 1-8 per
 * second during timelapse playback, starving the decodes playback needs. Remote images
 * keep the disk cache so they aren't re-downloaded.
 */
export function cachePolicyFor(uri: string | undefined): NonNullable<ImageProps['cachePolicy']> {
  return uri?.startsWith('file://') ? 'memory' : 'disk';
}
