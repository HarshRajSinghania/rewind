import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';
import type { PhotoEntry } from '@/types';
import { getToday } from '@/utils/dates';
import { readZipEntries, readZipEntry, type ByteSource } from '@/utils/zipReader';

export async function pickPhotosFromLibrary(): Promise<{ uri: string; date: string | null }[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
    exif: true,
  });
  if (result.canceled) return [];
  return result.assets.map(asset => ({
    uri: asset.uri,
    date: asset.exif?.DateTimeOriginal
      ? (() => {
          try {
            // EXIF format: "YYYY:MM:DD HH:MM:SS"
            const raw = String(asset.exif.DateTimeOriginal);
            const datePart = raw.split(' ')[0].replace(/:/g, '-');
            return datePart; // YYYY-MM-DD
          } catch { return getToday(); }
        })()
      : getToday(),
  }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: unknown): s is string {
  return typeof s === 'string' && DATE_RE.test(s);
}

export async function importFromBackup(
  albumId: string = 'daily-selfie',
  onProgress?: (current: number, total: number) => void,
  cancelSignal?: { cancelled: boolean },
): Promise<PhotoEntry[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  const srcFile = new File(result.assets[0].uri);
  // Random access through a file handle: read the zip's directory, then one photo at a
  // time. Loading the whole backup (base64 + JSZip) needs several times its size in JS
  // memory, which a year of photos (1+ GB) cannot survive.
  const handle = srcFile.open();
  try {
    const src: ByteSource = {
      size: handle.size ?? srcFile.size,
      read(offset, length) {
        handle.offset = offset;
        return handle.readBytes(length);
      },
    };
    return readBackupEntries(src, albumId, onProgress, cancelSignal);
  } finally {
    handle.close();
    // The picker copied the backup into the cache — possibly gigabytes; don't leave it there.
    try { srcFile.delete(); } catch {}
  }
}

function readBackupEntries(
  src: ByteSource,
  albumId: string,
  onProgress?: (current: number, total: number) => void,
  cancelSignal?: { cancelled: boolean },
): PhotoEntry[] {
  const entries = readZipEntries(src);
  const manifestEntry = entries.get('manifest.json');
  if (!manifestEntry) throw new Error('Invalid backup: no manifest.json found');
  const manifest = JSON.parse(strFromU8(readZipEntry(src, manifestEntry)));

  // I1: validate manifest shape
  if (!manifest || !Array.isArray(manifest.photos)) {
    throw new Error('Invalid backup format: manifest.photos is missing or not an array');
  }

  const photos: PhotoEntry[] = [];
  const total = manifest.photos.length;
  for (let i = 0; i < total; i++) {
    // Honor cancellation between entries (reading one photo isn't interruptible,
    // so we stop before reading the next one).
    if (cancelSignal?.cancelled) throw new Error('Cancelled');

    const entry = manifest.photos[i];

    // I1: validate each entry's date
    const entryDate: string = isValidDate(entry.date) ? entry.date : getToday();

    const imageEntry = entries.get(entry.imageFile);
    if (!imageEntry) continue;
    const imageBytes = readZipEntry(src, imageEntry);

    // I1: append loop index to avoid same-millisecond filename collisions
    const filename = `rewind_import_${Date.now()}_${i}_${entryDate}.jpg`;
    const destFile = new File(Paths.document, filename);

    // I2: treat a failed write as a hard failure for this entry (skip it)
    try {
      destFile.write(imageBytes);
    } catch {
      if (onProgress) onProgress(i + 1, total);
      continue;
    }

    photos.push({
      id: `import_${Date.now()}-${Math.random().toString(36).slice(2, 8)}_${entryDate}`,
      albumId,
      date: entryDate,
      imageUri: destFile.uri,
      caption: entry.caption || '',
      capturedAt: new Date().toISOString(),
      cameraDirection: 'front',
    });

    // I1: surface progress after each photo is processed
    if (onProgress) onProgress(i + 1, total);
  }
  return photos;
}

// I2: createPhotoEntry treats a failed copy as a HARD failure - throws instead of
// persisting the volatile picker-cache URI which will be evicted later.
export async function createPhotoEntry(uri: string, date: string, caption: string = '', albumId: string = 'daily-selfie'): Promise<PhotoEntry> {
  const filename = `rewind_import_${Date.now()}.jpg`;
  const src = new File(uri);
  const dest = new File(Paths.document, filename);
  // Intentionally not catching: callers must handle this exception and skip/count as failed
  await src.copy(dest);
  return {
    id: `import_${Date.now()}-${Math.random().toString(36).slice(2, 8)}_${date}`,
    albumId, date, imageUri: dest.uri, caption,
    capturedAt: new Date().toISOString(),
    cameraDirection: 'front',
  };
}
