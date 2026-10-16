/** MediaPipe Face Landmarker on a still image (native: modules/face-mesh/{android,ios}). */
import { requireOptionalNativeModule } from 'expo';
import type { FaceMeshResult } from '@/utils/faceMetrics';

interface FaceMeshNative {
  /** Upright image file uri → mesh of the most prominent face, or null when there is none. */
  detect(uri: string): Promise<FaceMeshResult | null>;
}

const Native = requireOptionalNativeModule<FaceMeshNative>('FaceMesh');

export function isFaceMeshAvailable(): boolean {
  return Native != null;
}

export async function detectFaceMesh(uri: string): Promise<FaceMeshResult | null> {
  if (!Native) throw new Error('FaceMesh native module is not available');
  return Native.detect(uri);
}
