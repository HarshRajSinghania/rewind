import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { needsFaceScan, scanPhoto } from '@/utils/faceScan';
import type { PhotoEntry } from '@/types';

export const FACE_SCAN_FLUSH_EVERY = 20;

export interface FaceScanProgress {
  scanning: boolean;
  done: number;
  total: number;
}

const IDLE: FaceScanProgress = { scanning: false, done: 0, total: 0 };

function pendingScans(photos: PhotoEntry[], attempted: Set<string>): PhotoEntry[] {
  return photos.filter((p) => needsFaceScan(p) && !attempted.has(p.id));
}

/**
 * Scans photos that have no (current) faceScan, one at a time, while `enabled`.
 * Results are saved in batches through updatePhotos; leaving the screen or turning
 * alignment off stops after the in-flight photo, and the next visit picks up where
 * this one left off.
 */
export function useFaceScanBackfill(photos: PhotoEntry[], enabled: boolean): FaceScanProgress {
  const { updatePhotos } = useAppContext();
  const [progress, setProgress] = useState<FaceScanProgress>(IDLE);

  // Latest photos for the running loop, so a changed date range is followed without a restart.
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // Ids attempted this session. Successes stay until their flushed faceScan reaches
  // `photos` (no double scans); failures stay so one bad file can't loop. Not persisted,
  // so failures are retried on a later visit.
  const attemptedRef = useRef(new Set<string>());

  const hasWork = enabled && pendingScans(photos, attemptedRef.current).length > 0;

  useEffect(() => {
    if (!hasWork) return;
    let cancelled = false;
    let buffer: Record<string, Partial<PhotoEntry>> = {};
    let buffered = 0;
    let done = 0;

    const flush = () => {
      if (buffered === 0) return;
      updatePhotos(buffer);
      buffer = {};
      buffered = 0;
    };

    (async () => {
      try {
        while (!cancelled) {
          const queue = pendingScans(photosRef.current, attemptedRef.current);
          const next = queue[0];
          if (!next) break;
          setProgress({ scanning: true, done, total: done + queue.length });
          attemptedRef.current.add(next.id);
          try {
            const result = await scanPhoto(next.imageUri);
            if (result === 'unavailable') break;
            buffer[next.id] = { faceScan: result };
            buffered++;
            if (buffered >= FACE_SCAN_FLUSH_EVERY) flush();
          } catch (e) {
            console.warn('[faceScan] skipping photo for this session:', next.id, e);
          }
          done++;
        }
      } finally {
        flush();
        setProgress(IDLE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasWork, updatePhotos]);

  return progress;
}
