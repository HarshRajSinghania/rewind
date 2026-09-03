import { File, Directory, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import type { PhotoEntry } from '@/types';

type ProgressCallback = (current: number, total: number) => void;
type CancelToken = { cancelled: boolean };

function isLocalFile(uri: string): boolean {
  return uri.startsWith('file://');
}

function getExportDir(): Directory {
  return new Directory(Paths.cache, 'rewind-export');
}

function cleanupExportDir() {
  try {
    const dir = getExportDir();
    if (dir.exists) dir.delete();
  } catch {}
}

export interface ExportResult {
  exported: number;
  skipped: number;
}

export async function exportToPhotoAlbum(
  photos: PhotoEntry[],
  onProgress: ProgressCallback,
  cancel: CancelToken
): Promise<ExportResult> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') throw new Error('Permission denied');

  const localPhotos = photos.filter(p => isLocalFile(p.imageUri));
  const skipped = photos.length - localPhotos.length;
  if (localPhotos.length === 0) {
    const msg = skipped > 0
      ? `All ${skipped} photo${skipped !== 1 ? 's' : ''} are remote and cannot be exported.`
      : 'No local photos to export.';
    throw new Error(msg);
  }

  let album = await MediaLibrary.getAlbumAsync('Rewind');
  let lastSaved = 0;
  for (let i = 0; i < localPhotos.length; i++) {
    if (cancel.cancelled) throw new Error('Cancelled');
    const asset = await MediaLibrary.createAssetAsync(localPhotos[i].imageUri);
    if (!album) {
      album = await MediaLibrary.createAlbumAsync('Rewind', asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }
    lastSaved = i + 1;
    onProgress(lastSaved, localPhotos.length);
  }
  return { exported: localPhotos.length, skipped };
}

export async function exportToBackup(
  photos: PhotoEntry[],
  albumName: string,
  onProgress: ProgressCallback,
  cancel: CancelToken
): Promise<{ filePath: string; exported: number; skipped: number }> {
  const localPhotos = photos.filter(p => isLocalFile(p.imageUri));
  const skipped = photos.length - localPhotos.length;
  if (localPhotos.length === 0) {
    const msg = skipped > 0
      ? `All ${skipped} photo${skipped !== 1 ? 's' : ''} are remote and cannot be exported.`
      : 'No local photos to export.';
    throw new Error(msg);
  }

  const exportDir = getExportDir();
  if (!exportDir.exists) {
    exportDir.create({ intermediates: true, idempotent: true });
  }

  const zip = new JSZip();
  const imagesFolder = zip.folder('images')!;
  const manifest = {
    version: 1,
    exportDate: new Date().toISOString(),
    album: albumName,
    photos: [] as { id: string; date: string; caption: string; imageFile: string }[],
  };

  for (let i = 0; i < localPhotos.length; i++) {
    if (cancel.cancelled) {
      cleanupExportDir();
      throw new Error('Cancelled');
    }
    const photo = localPhotos[i];
    const filename = `${photo.date}.jpg`;
    const file = new File(photo.imageUri);
    const base64 = await file.base64();
    imagesFolder.file(filename, base64, { base64: true });
    manifest.photos.push({
      id: photo.id,
      date: photo.date,
      caption: photo.caption,
      imageFile: `images/${filename}`,
    });
    onProgress(i + 1, localPhotos.length + 1);
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const content = await zip.generateAsync({ type: 'base64' });

  const outputFile = new File(exportDir, `rewind-backup-${Date.now()}.rewind`);
  outputFile.write(content, { encoding: 'base64' });

  onProgress(localPhotos.length + 1, localPhotos.length + 1);
  return { filePath: outputFile.uri, exported: localPhotos.length, skipped };
}

export async function shareFile(filePath: string): Promise<void> {
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(filePath);
}

export { cleanupExportDir };
