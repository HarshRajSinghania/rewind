import { useEffect, useRef, useState } from 'react';
import { File } from 'expo-file-system';
import { useAppContext } from '@/context/AppContext';
import { encodePhoto, encodedName, PHOTO_ENCODING } from '@/utils/photoEncode';
import type { PhotoEntry } from '@/types';

export const ENCODE_FLUSH_EVERY = 5;

export interface PhotoEncodeProgress {
  encoding: boolean;
  done: number;
  total: number;
}

const IDLE: PhotoEncodeProgress = { encoding: false, done: 0, total: 0 };

function pendingEncodes(photos: PhotoEntry[], attempted: Set<string>): PhotoEntry[] {
  return photos.filter((p) => p.encoding !== PHOTO_ENCODING && p.imageUri.startsWith('file://') && !attempted.has(p.id));
}

function deleteQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

/**
 * Re-encodes photos that aren't stored as q95 yet, one at a time, while `enabled`.
 *
 * Each photo gets a new file; its entry is pointed at it in batches, and an original is
 * deleted only once the batch that replaces it has reached storage. A failed save keeps
 * both files and stops, so a photo can never end up pointing at a deleted file.
 */
export function usePhotoEncodeBackfill(photos: PhotoEntry[], enabled: boolean): PhotoEncodeProgress {
  const { updatePhotos } = useAppContext();
  const [progress, setProgress] = useState<PhotoEncodeProgress>(IDLE);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  // Ids tried this session: successes until their new entry arrives, failures so one bad
  // file can't loop (retried on a later visit).
  const attemptedRef = useRef(new Set<string>());

  const hasWork = enabled && pendingEncodes(photos, attemptedRef.current).length > 0;

  useEffect(() => {
    if (!hasWork) return;
    let cancelled = false;
    let patches: Record<string, Partial<PhotoEntry>> = {};
    let originals: string[] = [];

    /** Saves the batch; deletes the originals it replaced. False = stop (save failed). */
    const flush = async (): Promise<boolean> => {
      const ids = Object.keys(patches);
      if (ids.length === 0) return true;
      const batch = patches;
      const replaced = originals;
      patches = {};
      originals = [];
      // A photo deleted meanwhile: drop its new file instead of patching a missing entry.
      const live = new Set(photosRef.current.map((p) => p.id));
      for (const id of ids) {
        if (!live.has(id)) {
          deleteQuietly(batch[id].imageUri!);
          delete batch[id];
        }
      }
      if (!(await updatePhotos(batch))) return false;
      replaced.forEach(deleteQuietly);
      return true;
    };

    (async () => {
      try {
        while (!cancelled) {
          const queue = pendingEncodes(photosRef.current, attemptedRef.current);
          const next = queue[0];
          if (!next) break;
          const all = photosRef.current.length;
          setProgress({ encoding: true, done: all - queue.length, total: all });
          attemptedRef.current.add(next.id);
          try {
            const uri = await encodePhoto(next.imageUri, encodedName(next.imageUri));
            patches[next.id] = { imageUri: uri, encoding: PHOTO_ENCODING };
            originals.push(next.imageUri);
          } catch (e) {
            console.warn('[photoEncode] skipping photo for this session:', next.id, e);
            continue;
          }
          if (Object.keys(patches).length >= ENCODE_FLUSH_EVERY && !(await flush())) break;
        }
      } finally {
        await flush();
        if (!cancelled) setProgress(IDLE);
      }
    })();

    return () => {
      cancelled = true;
      setProgress(IDLE);
    };
  }, [hasWork, updatePhotos]);

  return progress;
}
